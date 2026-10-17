"use client";

import { Cross2Icon, StopIcon } from "@radix-ui/react-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  baseMime,
  liveSampleIndexFor,
  microphoneErrorMessage,
  pickVoiceMime,
  VOICE_BITS_PER_SECOND,
  VOICE_LIVE_SLOTS,
  VOICE_MAX_MS,
  VOICE_SAMPLE_MS,
  voiceFileName,
  voiceMimeForStore,
} from "@/lib/client/voice-recorder";
import { momentClock } from "@/lib/moments/compose-rules";
import { MOMENT_PEAK_BUCKETS, peakFromAmplitude, pushLiveBar, resamplePeaks } from "@/lib/moments/peaks";

/** 一次录完的成果（停止后立刻交给父级上传，见 docs/moment-audio-spec.md §2.4）。 */
export type VoiceRecording = {
  file: File;
  /** 实时波形落下来的峰值（0–100，最多 MOMENT_PEAK_BUCKETS 个） */
  peaks: number[];
  durationMs: number;
  /** 存进瞬间 JSON 的 mime（MediaRecorder 实际报出来的，未知按 audio/webm） */
  mime: string;
};

type Phase = "starting" | "recording" | "uploading" | "error";

/**
 * 网页端的**置顶长条录音卡片**：左边实时波形（从左往右长、满窗口后整条向左滚）、
 * 中间计时、右边停止按钮。
 *
 * 交互口径（用户决策，见 docs/moment-audio-spec.md §2.4）：
 *  - 停止按钮 = 停止 + **自动上传**，上传成功后由父级关掉卡片；
 *  - 录到 5:00 自动停并上传；中途可以取消（外面再点一次麦克风 / 点 ✕ / 按 Esc）；
 *  - 麦克风被拒、上传失败都在卡片里给一句人话，不静默。
 */
export function VoiceRecorderPanel({
  onCancel,
  onRecorded,
}: {
  onCancel: () => void;
  /** 停止即上传：父级在这里走现成的上传链路；抛错则卡片留下来显示原因 */
  onRecorded: (recording: VoiceRecording) => Promise<void>;
}) {
  const [bars, setBars] = useState<number[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [phase, setPhase] = useState<Phase>("starting");
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const peaksRef = useRef<number[]>([]);
  const mimeRef = useRef("audio/webm");
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const finishedRef = useRef(false);
  /** 停止按钮永远调到"当前这次录音"的 stop（effect 里定义，避免按钮直接摸 recorder 状态） */
  const stopRef = useRef<() => void>(() => undefined);
  /** `onRecorded` 每次渲染都可能换引用，用 ref 拿最新那个，避免把启动 effect 反复重跑 */
  const recordedRef = useRef(onRecorded);

  useEffect(() => {
    recordedRef.current = onRecorded;
  }, [onRecorded]);

  const releaseMic = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      try {
        recorder.stop();
      } catch {
        // 已经停了就算了
      }
    }
    recorderRef.current = null;
    analyserRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const context = contextRef.current;
    contextRef.current = null;
    if (context) {
      void context.close().catch(() => undefined);
    }
  }, []);

  /**
   * 启动这次录音。
   *
   * ⚠️ **这个 effect 里不做任何同步 setState**（`react-hooks/set-state-in-effect` 是 error）：
   * 首帧的状态由 `useState` 的初值给，"重新录"要的重置在下面的事件处理里做；
   * effect 内部只在异步回调（麦克风拿到之后）或定时器里改状态。
   */
  useEffect(() => {
    let cancelled = false;
    finishedRef.current = false;
    chunksRef.current = [];
    peaksRef.current = [];

    async function finish() {
      if (cancelled) {
        releaseMic();
        return;
      }
      const durationMs = Math.min(
        VOICE_MAX_MS,
        Math.max(0, Date.now() - startedAtRef.current),
      );
      const mime = mimeRef.current || "audio/webm";
      const chunkType = baseMime(mime) || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: chunkType });
      releaseMic();
      if (blob.size === 0) {
        setPhase("error");
        setMessage("这段录音是空的，再试一次");
        return;
      }
      const file = new File([blob], voiceFileName(mime, Date.now()), {
        type: chunkType,
      });
      try {
        await recordedRef.current({
          file,
          peaks: resamplePeaks(peaksRef.current, MOMENT_PEAK_BUCKETS),
          durationMs,
          mime: voiceMimeForStore(mime),
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        setPhase("error");
        setMessage(
          error instanceof Error && error.message
            ? error.message
            : "上传失败，请重试",
        );
      }
    }

    function stop() {
      if (finishedRef.current) {
        return;
      }
      finishedRef.current = true;
      // 停止即上传：先把状态切到"上传中"，界面立刻给出反馈
      setPhase("uploading");
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      } else {
        void finish();
      }
    }

    function tick() {
      const elapsedMs = Date.now() - startedAtRef.current;
      setElapsed(elapsedMs);
      const analyser = analyserRef.current;
      if (analyser) {
        const frame = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(frame);
        let sum = 0;
        for (let index = 0; index < frame.length; index += 1) {
          const value = ((frame[index] ?? 128) - 128) / 128;
          sum += value * value;
        }
        const peak = peakFromAmplitude(Math.sqrt(sum / frame.length));
        peaksRef.current.push(peak);
        setBars((current) => pushLiveBar(current, peak, VOICE_LIVE_SLOTS));
      }
      if (elapsedMs >= VOICE_MAX_MS) {
        stop();
      }
    }

    stopRef.current = stop;

    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw Object.assign(new Error("no mediaDevices"), { name: "NotSupportedError" });
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;

        const mime = pickVoiceMime(
          (value) =>
            typeof MediaRecorder !== "undefined" &&
            MediaRecorder.isTypeSupported(value),
        );
        const recorder = mime
          ? new MediaRecorder(stream, {
              mimeType: mime,
              audioBitsPerSecond: VOICE_BITS_PER_SECOND,
            })
          : new MediaRecorder(stream, { audioBitsPerSecond: VOICE_BITS_PER_SECOND });
        mimeRef.current = voiceMimeForStore(recorder.mimeType || mime);
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunksRef.current.push(event.data);
          }
        };
        recorder.onstop = () => {
          void finish();
        };
        recorderRef.current = recorder;

        const ContextCtor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (ContextCtor) {
          const context = new ContextCtor();
          const analyser = context.createAnalyser();
          analyser.fftSize = 1024;
          context.createMediaStreamSource(stream).connect(analyser);
          contextRef.current = context;
          analyserRef.current = analyser;
        }

        recorder.start(1000);
        startedAtRef.current = Date.now();
        setPhase("recording");
        timerRef.current = window.setInterval(tick, VOICE_SAMPLE_MS);
      } catch (error) {
        if (!cancelled) {
          releaseMic();
          setPhase("error");
          setMessage(microphoneErrorMessage(error));
        }
      }
    })();

    return () => {
      cancelled = true;
      releaseMic();
    };
  }, [attempt, releaseMic]);

  const recording = phase === "recording";
  const remainingMs = Math.max(0, VOICE_MAX_MS - elapsed);

  const card = (
    <div
      aria-label="录音"
      className="voice-recorder"
      data-phase={phase}
      onKeyDown={(event) => {
        if (event.key === "Escape" && phase !== "uploading") {
          releaseMic();
          onCancel();
        }
      }}
      role="dialog"
      tabIndex={-1}
    >
      <span className="voice-recorder__dot" data-on={recording} />
      {/*
        波形 = **固定 10 秒窗口**（用户口径）：永远画 `VOICE_LIVE_SLOTS` 个槽位，
        录满 10 秒前只填左边那几个（从左往右长），之后整条往左滚 —— 屏幕上始终是"过去 10 秒"。
        槽位是固定的，所以每个槽的宽度不随录制时长变化（不是"越录越细"）。
      */}
      <div className="voice-recorder__wave" data-empty={bars.length === 0}>
        {bars.length === 0 ? (
          <span className="voice-recorder__idle">
            {phase === "starting" ? "正在打开麦克风…" : "等你说第一句"}
          </span>
        ) : null}
        {Array.from({ length: VOICE_LIVE_SLOTS }, (_, slot) => {
          // 用户口径：**从左往右长**；满了之后整条波形向左滚一格，最旧的从左边滑出。
          // 数组 0 = 最旧、末尾 = 最新，所以槽位与下标的映射同向（算式在 liveSampleIndexFor 里）。
          const index = liveSampleIndexFor(slot, VOICE_LIVE_SLOTS);
          const value = index < bars.length ? bars[index] : undefined;
          if (value === undefined) {
            return <i data-slot="empty" key={slot} />;
          }
          return <i key={slot} style={{ height: `${Math.max(6, value)}%` }} />;
        })}
      </div>
      <span className="voice-recorder__time" title="录制时间 / 上限 5 分钟">
        {momentClock(elapsed)}
        {remainingMs <= 30_000 && recording ? (
          <em className="voice-recorder__left">剩 {Math.ceil(remainingMs / 1000)}s</em>
        ) : null}
      </span>
      {phase === "error" ? (
        <p className="voice-recorder__error" role="alert">
          {message}
        </p>
      ) : null}
      {phase === "uploading" ? (
        <span className="voice-recorder__hint">上传中…</span>
      ) : null}
      {phase === "error" ? (
        <button
          className="voice-recorder__redo"
          onClick={() => {
            // 重录的全部重置都在这里（事件处理里 setState 是允许的）：
            // effect 里再同步 setState 会被 react-hooks/set-state-in-effect 判成 error
            releaseMic();
            setBars([]);
            setElapsed(0);
            setMessage("");
            setPhase("starting");
            setAttempt((value) => value + 1);
          }}
          type="button"
        >
          重新录
        </button>
      ) : null}
      <button
        aria-label="取消录音"
        className="voice-recorder__cancel"
        disabled={phase === "uploading"}
        onClick={() => {
          releaseMic();
          onCancel();
        }}
        title="取消"
        type="button"
      >
        <Cross2Icon />
      </button>
      <button
        aria-label="停止并上传"
        className="voice-recorder__stop"
        disabled={phase !== "recording"}
        onClick={() => stopRef.current()}
        title="停止并上传"
        type="button"
      >
        <StopIcon />
      </button>
    </div>
  );

  /**
   * **必须 portal 到 `document.body`**（与 `AdminDialog` 同一套做法，见 P-135）：
   * 后台外壳在切页/入场动画里带 `transform`，祖先一旦有 transform/filter/contain，
   * `position: fixed` 就改成相对那个祖先定位 —— 实测卡片被推到 `top=143px`，
   * 用户看到的就不是"贴顶长条"了。挂在 body 上，`fixed` 才是相对视口。
   * （配色 token 定义在 `:root`，所以脱离 `.admin-workspace` 也照样有颜色。）
   *
   * 本组件只在用户点了麦克风之后才挂载（`recorderOpen` 初值 false），所以服务端不会渲染它；
   * `typeof document` 只是兜底，不涉及水合差异。
   */
  return typeof document === "undefined" ? card : createPortal(card, document.body);
}

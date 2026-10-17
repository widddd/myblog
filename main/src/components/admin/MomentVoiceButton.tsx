"use client";

import { useRef } from "react";

import { MicIcon } from "@/components/common/MicIcon";
import { MOMENT_MAX_AUDIOS } from "@/lib/moments/compose-rules";
import { VOICE_RECORD_ACCEPT } from "@/lib/upload/limits";

/**
 * 发布区的**麦克风按钮**（与「插入图片 / 视频」并排的图标按钮）。
 *
 * 两条完全不同的路径（见 docs/moment-audio-spec.md §2.4 / §2.5）：
 *  - **浏览器**：点一下开关置顶录音卡片（getUserMedia 录、WebM/Opus 编码、停止即上传）；
 *  - **App（服务端按 UA 判定）**：点一下打开一个 `accept` 带录音标记 + `capture` 的隐藏文件输入，
 *    GeckoView 把它变成 `onFilePrompt` 交给宿主 → 宿主弹**原生录音界面**（波形 / 裁剪 / 试听），
 *    录完的文件经同一条 prompt 通道回给页面，页面走现有上传链路。
 *
 * 一条瞬间最多 5 条：录满就把按钮禁掉（不靠"提交时再报错"）。
 */
export function MomentVoiceButton({
  appMode,
  count,
  disabled,
  recording,
  onAppFiles,
  onToggleRecording,
}: {
  /** 服务端 UA 判定（`isSmartBlogApp`），不在客户端再判一次 */
  appMode: boolean;
  count: number;
  disabled?: boolean;
  /** 浏览器模式下卡片是不是开着（开着时按钮显示激活态） */
  recording: boolean;
  /** App：宿主录音器回传的文件 */
  onAppFiles: (files: FileList) => void;
  /** 浏览器：开关录音卡片 */
  onToggleRecording: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const full = count >= MOMENT_MAX_AUDIOS;
  const remaining = Math.max(0, MOMENT_MAX_AUDIOS - count);

  return (
    <span className="moment-compose__voice">
      <button
        aria-label={recording ? "收起录音卡片" : `录音（已录 ${count}/${MOMENT_MAX_AUDIOS}）`}
        className="moment-compose__icon-btn"
        data-recording={recording ? "true" : undefined}
        disabled={disabled || full}
        onClick={() => {
          if (appMode) {
            inputRef.current?.click();
            return;
          }
          onToggleRecording();
        }}
        title={
          full
            ? `一条瞬间最多 ${MOMENT_MAX_AUDIOS} 条语音`
            : `录音（还能录 ${remaining} 条）`
        }
        type="button"
      >
        <MicIcon width={18} height={18} />
        {count > 0 ? <span className="moment-compose__count">{count}</span> : null}
      </button>
      {appMode ? (
        <input
          accept={VOICE_RECORD_ACCEPT}
          capture="user"
          hidden
          onChange={(event) => {
            const files = event.target.files;
            if (files?.length) {
              onAppFiles(files);
            }
            event.currentTarget.value = "";
          }}
          ref={inputRef}
          type="file"
        />
      ) : null}
    </span>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { MomentImageButton } from "@/components/admin/MomentImageButton";
import { MomentScopePicker } from "@/components/admin/MomentScopePicker";
import { MomentSettingsDrawer } from "@/components/admin/MomentSettingsDrawer";
import { MomentVoiceButton } from "@/components/admin/MomentVoiceButton";
import { VoiceRecorderPanel, type VoiceRecording } from "@/components/admin/VoiceRecorderPanel";
import { MomentAudioRow } from "@/components/moment/MomentAudioRow";
import type { MomentVisibilityPanelData } from "@/lib/moments/compose-types";
import { SortableImageGrid } from "@/components/admin/SortableImageGrid";
import { adminJson } from "@/lib/client/admin";
import {
  registerLocalPreviews,
  releaseLocalPreviews,
  resolveLocalPreview,
} from "@/lib/client/local-preview";
import {
  finalizeAdminUploads,
  guessUploadKind,
  hasActiveTransfers,
  readMediaDuration,
  readMediaProbe,
  uploadAdminFile,
  UploadCancelledError,
  type AdminUploadResult,
  type MediaProbe,
} from "@/lib/client/upload";
import {
  countMomentAudios,
  countMomentVideos,
  MOMENT_AUDIO_LIMIT_ERROR,
  MOMENT_AUDIO_TOO_LONG_ERROR,
  MOMENT_MAX_AUDIOS,
  MOMENT_MAX_AUDIO_MS,
  MOMENT_MAX_VIDEOS,
  MOMENT_VIDEO_LIMIT_ERROR,
  momentContentError,
  splitMomentMedia,
} from "@/lib/moments/compose-rules";
import type { MomentImage } from "@/lib/moments/types";
import type { MomentVisibilityGroupView } from "@/lib/moments/visibility-group-view";
import { firstMediaHash } from "@/lib/uploads/hashes";

/**
 * 九宫格里的媒体：**只有图片/视频**（语音不进格子，见 `splitMomentMedia`）。
 * 这里把 kind 收窄成 `image | video`，`SortableImageGrid` 那侧才不用再判一次
 * （语音走下面独立的播放行列表）。
 */
type VisualMomentImage = MomentImage & { kind?: "image" | "video" };
type GridImage = VisualMomentImage & { id: string; src: string };

const MAX_ROWS = 10;

/**
 * 稳定 id：**不能**把数组下标编进 key（原来是 `${image.key}-${index}`）。
 * 一旦把下标写进 key，拖动重排后每一张的 key 都变了 → React 把 <img> 全部重新挂载 → 图片重新请求，
 * 这就是"拖动时图片会重新加载"的根因。这里按对象身份分配一次 id（挂在 Symbol 上），
 * 重排只搬对象、id 不变；同一张图被选多次也各有各的 id。
 */
const kImageId = Symbol("momentImageId");
let imageIdSeq = 0;
function stableImageId(image: MomentImage): string {
  const holder = image as MomentImage & { [kImageId]?: string };
  if (!holder[kImageId]) {
    imageIdSeq += 1;
    holder[kImageId] = `img-${imageIdSeq}`;
  }
  return holder[kImageId];
}

/**
 * 这项媒体在预览登记表里的键 = 它在格子里要显示的地址。
 *
 * 图片 = 一级缩略图；视频没有封面，约定把视频自身地址放在 `thumb`（见 `uploadResultToImage`），
 * 所以两种媒体都是 `thumb ?? key`，`toGrid()` 与登记处共用这一个口径。
 */
function previewKeyOf(image: MomentImage): string {
  return image.thumb || image.key;
}

function toGrid(images: VisualMomentImage[]): GridImage[] {
  return images.map((image) => {
    const remote = previewKeyOf(image);
    return {
      ...image,
      id: stableImageId(image),
      // 本机刚选的图直接用 blob 预览（见 lib/client/local-preview.ts）：
      // 服务端地址要等发布时才变成真正的对外地址，此刻回头去拉一遍纯属浪费
      src: resolveLocalPreview(remote) ?? remote,
    };
  });
}

function fromGrid(items: GridImage[]): MomentImage[] {
  return items.map((item) => ({
    key: item.key,
    thumb: item.thumb,
    width: item.width,
    height: item.height,
    kind: item.kind,
    mime: item.mime,
    duration: item.duration,
  }));
}

/** 上传结果 + 本机探测到的元信息 → 瞬间媒体项。视频/音频的宽高、时长服务端不探测，只有这里能给。 */
function uploadResultToImage(
  item: AdminUploadResult,
  probe?: MediaProbe | null,
): MomentImage {
  if (item.kind === "audio") {
    return {
      key: item.original.key,
      // 音频没有封面（也没有缩略图）：约定把音频自己的地址放在 `thumb`，
      // 这样本机预览登记表（previewKeyOf = thumb ?? key）与播放行共用同一个"地址"口径
      thumb: item.original.url,
      kind: "audio",
      mime: item.mime,
      duration: probe?.duration ?? item.duration ?? undefined,
    };
  }
  const kind = item.kind === "video" ? "video" : "image";
  return {
    key: item.original.key,
    // 图片 = 一级缩略图；视频没有封面，这里放视频自身地址（格子里的 <video src> 直接吃它）
    thumb: item.thumb?.url ?? item.original.url,
    width: probe?.width ?? item.original.width ?? undefined,
    height: probe?.height ?? item.original.height ?? undefined,
    kind,
    ...(kind === "video"
      ? { mime: item.mime, duration: probe?.duration ?? item.duration ?? undefined }
      : {}),
  };
}

/**
 * 发布瞬间：像朋友圈一样只有一个输入框 + 一个插入媒体的图标按钮，
 * 可见范围与图标按钮同一行（点开是小卡片），右侧是发布按钮。
 * 其它设置全部收进「详细设置」抽屉。
 *
 * 2026-10 起：可以只发媒体不发文字；媒体支持图片 + 视频（一条瞬间最多 1 个视频，
 * 见 docs/moment-video-spec.md）。
 */
export function MomentCompose({
  appMode,
  globalDays,
  groups,
  maxImages,
  settingsData,
}: {
  /** 这一发是不是 SmartBlog App（服务端按 UA 判定）：决定麦克风按钮走原生录音器还是网页卡片 */
  appMode: boolean;
  globalDays: number;
  groups: MomentVisibilityGroupView[];
  /** 一次最多能选几个媒体；由服务端 Setting 给（与 Android 客户端同源），不要在客户端写死 */
  maxImages: number;
  /** 「详细设置」抽屉需要的纯数据（含全局可见期与各档位预览文案） */
  settingsData: MomentVisibilityPanelData;
}) {
  const router = useRouter();
  const [content, setContent] = useState("");
  // "" = 跟随全局可见期；否则是可见范围组 id
  const [groupId, setGroupId] = useState("");
  const [images, setImages] = useState<MomentImage[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** 浏览器模式下录音卡片开着没有（App 模式恒为 false：那边走原生录音界面） */
  const [recorderOpen, setRecorderOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  /** 卸载时要回收本机预览，用 ref 记住"当下还挂着哪几张"（effect 清理里读不到最新 state） */
  const imagesRef = useRef<MomentImage[]>([]);

  // 图片/视频与语音**分区展示**，条数也各算各的（见 lib/moments/compose-rules.ts）
  const { visual, audios } = splitMomentMedia(images);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  // 离开本页（或组件被替换掉）时回收本组件创建的 blob；页面刷新则由浏览器回收
  useEffect(
    () => () => {
      releaseLocalPreviews(imagesRef.current.map(previewKeyOf));
    },
    [],
  );

  // 输入框随内容长高（像朋友圈），到上限后内部滚动
  useEffect(() => {
    const element = textareaRef.current;
    if (!element) {
      return;
    }
    element.style.height = "auto";
    const lineHeight = 24;
    const maxHeight = MAX_ROWS * lineHeight;
    element.style.height = `${Math.min(element.scrollHeight, maxHeight)}px`;
    element.style.overflowY = element.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [content]);

  /**
   * 追加图片 / 视频：**上限只算"非音频"那些**（`maxImages`），语音走自己的 5 条上限。
   * 顺序上把语音排在后面（展示本来就分区，这里只是让 JSON 稳定好读）。
   */
  const appendUploads = (items: MomentImage[]) => {
    setImages((current) => {
      const { visual: currentVisual, audios: currentAudios } = splitMomentMedia(current);
      const room = Math.max(0, maxImages - currentVisual.length);
      return [...currentVisual, ...items.slice(0, room), ...currentAudios];
    });
  };

  /** 追加一条语音：条数与时长都在这里拦（服务端同一套规则再兜一次） */
  const appendAudio = (item: MomentImage) => {
    setImages((current) => [...current, item]);
  };

  /** 九宫格里重排 / 删掉一张：重排什么都不用做，删掉的那张要把本机预览回收掉（谁创建谁回收） */
  function handleGridChange(next: GridImage[]) {
    const kept = new Set(next.map((item) => item.id));
    releaseLocalPreviews(
      toGrid(visual)
        .filter((item) => !kept.has(item.id))
        .map(previewKeyOf),
    );
    // 九宫格只管图片/视频：语音原样留在后面，别被这次重排顺手丢掉
    setImages([...fromGrid(next), ...audios]);
  }

  /** 删掉一条语音（发布前可随时重录）：本机预览与它一起回收 */
  function removeAudio(audio: MomentImage) {
    releaseLocalPreviews([previewKeyOf(audio)]);
    setImages((current) => current.filter((item) => item !== audio));
  }

  /** 站点上限：浏览器路径不做视频压缩，超过服务端上限的文件会 413，这里先给一句人话。 */
  const uploadErrorMessage = (caught: unknown) =>
    caught instanceof Error ? caught.message : "上传失败";

  async function addFromLocal(files: FileList | null) {
    if (!files?.length) {
      return;
    }
    const remaining = maxImages - visual.length;
    if (remaining <= 0) {
      setError(`最多 ${maxImages} 个`);
      return;
    }

    // 一条瞬间最多 1 个视频（用户决策）：先把超出的视频挡在选择阶段，
    // 别等上传完了才说"不能发"——那既浪费流量，也留了一堆没用的文件。
    let videoSlots = Math.max(0, MOMENT_MAX_VIDEOS - countMomentVideos(images));
    const accepted: File[] = [];
    for (const file of Array.from(files).slice(0, remaining)) {
      const kind = guessUploadKind(file);
      if (!kind || kind === "audio") {
        setError(`只支持图片或视频：${file.name}`);
        continue;
      }
      if (kind === "video") {
        if (videoSlots <= 0) {
          setError(MOMENT_VIDEO_LIMIT_ERROR);
          continue;
        }
        videoSlots -= 1;
      }
      accepted.push(file);
    }
    if (accepted.length === 0) {
      return;
    }

    setError("");
    setUploading(true);
    try {
      const added: MomentImage[] = [];
      const previewFiles: File[] = [];
      const previewUrls: string[] = [];
      for (const file of accepted) {
        const kind = guessUploadKind(file);
        if (!kind) {
          continue;
        }
        // 视频宽高/时长只能在这里探测（服务端不装 ffmpeg，不会去读视频元信息）
        const probe = kind === "video" ? await readMediaProbe(file) : null;
        const uploaded = await uploadAdminFile(file, kind, undefined, {
          defer: true,
        });
        const media = uploadResultToImage(uploaded, probe);
        added.push(media);
        previewFiles.push(file);
        previewUrls.push(previewKeyOf(media));
      }
      // 上传成功后才登记本机预览：本来就在手里的文件，别为了预览再回服务器拉一遍原图
      registerLocalPreviews(previewFiles, previewUrls);
      appendUploads(added);
    } catch (caught) {
      if (caught instanceof UploadCancelledError) {
        return;
      }
      setError(uploadErrorMessage(caught));
    } finally {
      setUploading(false);
    }
  }

  function addFromLibrary(files: AdminUploadResult[]) {
    if (files.length === 0) {
      return;
    }
    const remaining = maxImages - visual.length;
    if (remaining <= 0) {
      setError(`最多 ${maxImages} 个`);
      return;
    }
    // 媒体库给的是库里已有的文件（hash 已在 Upload 表里）：直接用它的访问地址展示，
    // 发布时的 finalize 对已处理的 hash 返回 null 并跳过。视频同样最多 1 个。
    let videoSlots = Math.max(0, MOMENT_MAX_VIDEOS - countMomentVideos(images));
    const accepted: MomentImage[] = [];
    for (const file of files.slice(0, remaining)) {
      if (file.kind === "video") {
        if (videoSlots <= 0) {
          setError(MOMENT_VIDEO_LIMIT_ERROR);
          continue;
        }
        videoSlots -= 1;
      }
      accepted.push(uploadResultToImage(file));
    }
    if (accepted.length === 0) {
      return;
    }
    setError("");
    appendUploads(accepted);
  }

  /**
   * 收一条语音（浏览器录的 / App 原生录音器回传的）：**先拦规则，再上传**。
   *
   * 失败时把错误抛回调用方（录音卡片要留在原地显示原因），同时记到发布区的错误行。
   * 见 docs/moment-audio-spec.md §2.4 / §2.5。
   */
  async function addVoice(recording: {
    file: File;
    peaks?: number[];
    durationMs?: number;
  }) {
    if (countMomentAudios(images) >= MOMENT_MAX_AUDIOS) {
      setError(MOMENT_AUDIO_LIMIT_ERROR);
      throw new Error(MOMENT_AUDIO_LIMIT_ERROR);
    }
    // 浏览器录音直接给录制时长（最准）；App 回传的文件本地探测一次，
    // 目的只是**上传前**就能拦下超长的那条（服务端也会再判一次）。
    const durationSec =
      recording.durationMs != null
        ? recording.durationMs / 1000
        : await readMediaDuration(recording.file);
    if (durationSec != null && durationSec * 1000 > MOMENT_MAX_AUDIO_MS) {
      setError(MOMENT_AUDIO_TOO_LONG_ERROR);
      throw new Error(MOMENT_AUDIO_TOO_LONG_ERROR);
    }

    setError("");
    setUploading(true);
    try {
      const uploaded = await uploadAdminFile(recording.file, "audio", undefined, {
        defer: true,
        // 录音时长直接给（浏览器录的 WebM 头部没有时长，让服务端探是探不到的）
        durationSec,
      });
      const media: MomentImage = {
        ...uploadResultToImage(uploaded, {
          duration: durationSec,
          width: null,
          height: null,
        }),
        // 真峰值只有浏览器录音有（实时采样）；App 回传的没有 → 渲染端用确定性图案兜底
        ...(recording.peaks?.length ? { peaks: recording.peaks } : {}),
      };
      // 本机预览：文件就在手里，发布前试听别回源拉一遍
      registerLocalPreviews([recording.file], [previewKeyOf(media)]);
      appendAudio(media);
    } catch (caught) {
      const message = uploadErrorMessage(caught);
      setError(message);
      throw new Error(message);
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit() {
    setError("");
    const invalid = momentContentError({ content, images });
    if (invalid) {
      setError(invalid);
      return;
    }
    if (hasActiveTransfers()) {
      setError("请等待图片/视频上传完成后再发布");
      return;
    }
    setSaving(true);
    try {
      const hashes = images
        .map((image) => firstMediaHash(image.key))
        .filter((hash): hash is string => Boolean(hash));
      const finalized = await finalizeAdminUploads(hashes);
      const byHash = new Map(finalized.map((item) => [item.hash, item]));
      const nextImages = images.map((image) => {
        const hash = firstMediaHash(image.key);
        const match = hash ? byHash.get(hash) : undefined;
        if (!match) {
          return image;
        }
        return {
          key: match.original.key,
          thumb: match.thumb?.url ?? match.original.url,
          width: match.original.width ?? image.width,
          height: match.original.height ?? image.height,
          kind: image.kind,
          mime: image.mime,
          duration: image.duration,
          peaks: image.peaks,
        };
      });
      await adminJson("/api/admin/moments", {
        method: "POST",
        body: JSON.stringify({
          content,
          images: nextImages,
          visibilityGroupId: groupId === "" ? null : Number.parseInt(groupId, 10),
        }),
      });
      setContent("");
      setImages([]);
      setGroupId("");
      setRecorderOpen(false);
      // 发布完这些图已经有对外的 COS / 站内地址了，本机 blob 预览当场回收
      releaseLocalPreviews(images.map(previewKeyOf));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "发布失败");
    } finally {
      setSaving(false);
    }
  }

  const blocked = momentContentError({ content, images });

  return (
    <form
      className="moment-compose"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <textarea
        aria-label="瞬间内容"
        className="moment-compose__input"
        onChange={(event) => setContent(event.target.value)}
        placeholder="记录此刻的想法、心情或见闻…（也可以只发图片 / 视频）"
        ref={textareaRef}
        rows={4}
        value={content}
      />

      {visual.length > 0 ? (
        <div className="moment-compose__grid">
          <SortableImageGrid
            disabled={saving}
            images={toGrid(visual)}
            onChange={handleGridChange}
          />
        </div>
      ) : null}

      {/* 语音与图片/视频**分区**：这里渲染草稿播放行（可试听、可删除），不占九宫格 */}
      {audios.length > 0 ? (
        <div className="moment-compose__audios">
          {audios.map((audio, index) => (
            <MomentAudioRow
              disabled={saving}
              index={index}
              item={{
                key: audio.key,
                src: resolveLocalPreview(previewKeyOf(audio)) ?? previewKeyOf(audio),
                duration: audio.duration,
                peaks: audio.peaks,
              }}
              key={`${audio.key}-${index}`}
              onRemove={() => removeAudio(audio)}
            />
          ))}
        </div>
      ) : null}

      <div className="moment-compose__bar">
        <MomentImageButton
          count={visual.length}
          disabled={saving || uploading}
          max={maxImages}
          onPickFromLibrary={addFromLibrary}
          onUpload={(files) => void addFromLocal(files)}
        />
        <MomentVoiceButton
          appMode={appMode}
          count={audios.length}
          disabled={saving || uploading}
          onAppFiles={(files) => {
            const file = files[0];
            if (file) {
              void addVoice({ file }).catch(() => undefined);
            }
          }}
          onToggleRecording={() => setRecorderOpen((current) => !current)}
          recording={recorderOpen}
        />
        <MomentScopePicker
          disabled={saving}
          globalDays={globalDays}
          groups={groups}
          onChange={setGroupId}
          onOpenSettings={() => setSettingsOpen(true)}
          value={groupId}
        />
        {uploading ? <span className="admin-muted">上传中…</span> : null}
        <button
          className="admin-btn moment-compose__submit"
          disabled={saving || uploading || Boolean(blocked)}
          type="submit"
        >
          {saving ? "发布中…" : "发布"}
        </button>
      </div>

      {error ? (
        <p className="admin-error" role="alert">
          {error}
        </p>
      ) : null}

      {/* 浏览器：置顶长条录音卡片（停止即上传）；App 模式不渲染它，走宿主原生录音界面 */}
      {recorderOpen && !appMode ? (
        <VoiceRecorderPanel
          onCancel={() => setRecorderOpen(false)}
          onRecorded={async (recording: VoiceRecording) => {
            await addVoice(recording);
            setRecorderOpen(false);
          }}
        />
      ) : null}

      <MomentSettingsDrawer
        data={settingsData}
        globalDays={globalDays}
        groups={groups}
        onClose={() => setSettingsOpen(false)}
        open={settingsOpen}
      />
    </form>
  );
}

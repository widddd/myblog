"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { MomentImageButton } from "@/components/admin/MomentImageButton";
import { MomentScopePicker } from "@/components/admin/MomentScopePicker";
import { MomentSettingsDrawer } from "@/components/admin/MomentSettingsDrawer";
import type { MomentVisibilityPanelData } from "@/lib/moments/compose-types";
import { SortableImageGrid } from "@/components/admin/SortableImageGrid";
import { adminJson } from "@/lib/client/admin";
import {
  finalizeAdminUploads,
  hasActiveTransfers,
  uploadAdminFiles,
  UploadCancelledError,
  type AdminUploadResult,
} from "@/lib/client/upload";
import type { MomentImage } from "@/lib/moments/types";
import type { MomentVisibilityGroupView } from "@/lib/moments/visibility-group-view";
import { firstMediaHash } from "@/lib/uploads/hashes";

type GridImage = MomentImage & { id: string; src: string };

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

function toGrid(images: MomentImage[]): GridImage[] {
  return images.map((image) => ({
    ...image,
    id: stableImageId(image),
    src: image.thumb || image.key,
  }));
}

function fromGrid(items: GridImage[]): MomentImage[] {
  return items.map((item) => ({
    key: item.key,
    thumb: item.thumb,
    width: item.width,
    height: item.height,
  }));
}

function uploadResultToImage(item: AdminUploadResult): MomentImage {
  return {
    key: item.original.key,
    thumb: item.thumb?.url ?? item.original.url,
    width: item.original.width ?? undefined,
    height: item.original.height ?? undefined,
  };
}

/**
 * 发布瞬间：像朋友圈一样只有一个输入框 + 一个插入图片的图标按钮，
 * 可见范围与图标按钮同一行（点开是小卡片），右侧是发布按钮。
 * 其它设置全部收进「详细设置」抽屉。
 */
export function MomentCompose({
  globalDays,
  groups,
  maxImages,
  settingsData,
}: {
  globalDays: number;
  groups: MomentVisibilityGroupView[];
  /** 一次最多能选几张图；由服务端 Setting 给（与 Android 客户端同源），不要在客户端写死 */
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const appendUploads = (items: AdminUploadResult[]) => {
    setImages((current) => [...current, ...items.map(uploadResultToImage)].slice(0, maxImages));
  };

  async function addFromLocal(files: FileList | null) {
    if (!files?.length) {
      return;
    }
    const remaining = maxImages - images.length;
    if (remaining <= 0) {
      setError(`最多 ${maxImages} 张图片`);
      return;
    }
    const selected = Array.from(files).slice(0, remaining);
    setError("");
    setUploading(true);
    try {
      const uploaded = await uploadAdminFiles(selected, "image", undefined, {
        defer: true,
      });
      appendUploads(uploaded);
    } catch (caught) {
      if (caught instanceof UploadCancelledError) {
        return;
      }
      setError(caught instanceof Error ? caught.message : "图片上传失败");
    } finally {
      setUploading(false);
    }
  }

  function addFromLibrary(files: AdminUploadResult[]) {
    if (files.length === 0) {
      return;
    }
    const remaining = maxImages - images.length;
    if (remaining <= 0) {
      setError(`最多 ${maxImages} 张图片`);
      return;
    }
    // 媒体库给的是库里已有的文件（hash 已在 Upload 表里）：直接用它的访问地址展示，
    // 发布时的 finalize 对已处理的 hash 返回 null 并跳过。一次可加入多张，超出上限截断。
    setError("");
    appendUploads(files.slice(0, remaining));
  }

  async function handleSubmit() {
    setError("");
    if (!content.trim()) {
      setError("先写点什么吧");
      return;
    }
    if (hasActiveTransfers()) {
      setError("请等待图片上传完成后再发布");
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
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "发布失败");
    } finally {
      setSaving(false);
    }
  }

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
        placeholder="记录此刻的想法、心情或见闻…"
        ref={textareaRef}
        rows={4}
        value={content}
      />

      {images.length > 0 ? (
        <div className="moment-compose__grid">
          <SortableImageGrid
            disabled={saving}
            images={toGrid(images)}
            onChange={(next) => setImages(fromGrid(next))}
          />
        </div>
      ) : null}

      <div className="moment-compose__bar">
        <MomentImageButton
          count={images.length}
          disabled={saving || uploading}
          max={maxImages}
          onPickFromLibrary={addFromLibrary}
          onUpload={(files) => void addFromLocal(files)}
        />
        <MomentScopePicker
          disabled={saving}
          globalDays={globalDays}
          groups={groups}
          onChange={setGroupId}
          onOpenSettings={() => setSettingsOpen(true)}
          value={groupId}
        />
        {uploading ? <span className="admin-muted">图片上传中…</span> : null}
        <button
          className="admin-btn moment-compose__submit"
          disabled={saving || uploading || !content.trim()}
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

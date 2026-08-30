"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { SortableImageGrid } from "@/components/admin/SortableImageGrid";
import { adminJson } from "@/lib/client/admin";
import { uploadAdminFiles } from "@/lib/client/upload";
import type { MomentImage } from "@/lib/moments/types";

type GridImage = MomentImage & { id: string; src: string };

function toGrid(images: MomentImage[]): GridImage[] {
  return images.map((image, index) => ({
    ...image,
    id: `${image.key}-${index}`,
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

export function MomentForm() {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [images, setImages] = useState<MomentImage[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState("");

  async function addImages(files: FileList | null) {
    if (!files?.length) {
      return;
    }
    const remaining = 9 - images.length;
    if (remaining <= 0) {
      setError("最多 9 张图片");
      return;
    }

    const selected = Array.from(files).slice(0, remaining);
    setError("");
    setUploading(`上传中 0/${selected.length}`);
    try {
      const uploaded = await uploadAdminFiles(
        selected,
        "image",
        (done, total) => setUploading(`上传中 ${done}/${total}`),
      );
      setImages((current) => [
        ...current,
        ...uploaded.map((item) => ({
          key: item.original.key,
          thumb: item.thumb?.url ?? item.original.url,
          width: item.original.width ?? undefined,
          height: item.original.height ?? undefined,
        })),
      ]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "图片上传失败");
    } finally {
      setUploading("");
    }
  }

  async function handleSubmit() {
    setError("");
    setSaving(true);
    try {
      await adminJson("/api/admin/moments", {
        method: "POST",
        body: JSON.stringify({ content, images }),
      });
      setContent("");
      setImages([]);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "发布失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="admin-form"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <label className="form-field">
        内容
        <textarea
          onChange={(event) => setContent(event.target.value)}
          required
          rows={4}
          value={content}
        />
      </label>
      <div className="form-field">
        图片（最多 9 张，可多选；1 张独图，2～4 张四宫格，5～9 张九宫格，按住拖动排序）
        <input
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
          disabled={images.length >= 9 || Boolean(uploading)}
          multiple
          onChange={(event) => {
            void addImages(event.target.files);
            event.currentTarget.value = "";
          }}
          type="file"
        />
        {uploading ? <p className="admin-muted">{uploading}</p> : null}
        <SortableImageGrid
          disabled={saving}
          images={toGrid(images)}
          onChange={(next) => setImages(fromGrid(next))}
        />
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="heo-button" disabled={saving || Boolean(uploading)} type="submit">
        {saving ? "发布中…" : "发布瞬间"}
      </button>
    </form>
  );
}

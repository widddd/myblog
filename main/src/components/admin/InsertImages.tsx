"use client";

import { usePublisher } from "@mdxeditor/gurx";
import { useState } from "react";

import { insertImage$ } from "@myblog/mdx-editor";

import { MediaInsertMenu } from "@/components/admin/MediaInsertMenu";
import { editorImageUrl, uploadAdminFiles, UploadCancelledError } from "@/lib/client/upload";

export function InsertImages() {
  const insertImage = usePublisher(insertImage$ as never);
  const [busy, setBusy] = useState(false);

  async function handleFiles(files: FileList) {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      const uploaded = await uploadAdminFiles(
        Array.from(files),
        "image",
        undefined,
        { defer: true },
      );
      for (const item of uploaded) {
        insertImage({ src: editorImageUrl(item), altText: "" });
      }
    } catch (error) {
      if (error instanceof UploadCancelledError) {
        return;
      }
      window.alert(error instanceof Error ? error.message : "图片上传失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <MediaInsertMenu
      accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
      busy={busy}
      kind="image"
      label="图片"
      onLink={(url) => insertImage({ src: url, altText: "" })}
      onPick={(item) => insertImage({ src: editorImageUrl(item), altText: "" })}
      onUpload={(files) => void handleFiles(files)}
    />
  );
}

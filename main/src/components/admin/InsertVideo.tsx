"use client";

import { usePublisher } from "@mdxeditor/gurx";
import { useState } from "react";

import { insertJsx$ } from "@myblog/mdx-editor";

import { MediaInsertMenu } from "@/components/admin/MediaInsertMenu";
import { uploadAdminFiles } from "@/lib/client/upload";

function insertVideo(insertJsx: (payload: unknown) => void, src: string) {
  insertJsx({
    kind: "flow",
    name: "Video",
    props: { src },
  });
}

export function InsertVideo() {
  const insertJsx = usePublisher(insertJsx$ as never);
  const [busy, setBusy] = useState(false);

  async function handleFiles(files: FileList) {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      const uploaded = await uploadAdminFiles(Array.from(files), "video", undefined, {
        defer: true,
      });
      for (const item of uploaded) {
        insertVideo(insertJsx, item.original.url);
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "视频上传失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <MediaInsertMenu
      accept="video/mp4,video/webm,.mp4,.webm"
      busy={busy}
      kind="video"
      label="视频"
      onLink={(url) => insertVideo(insertJsx, url)}
      onPick={(item) => insertVideo(insertJsx, item.original.url)}
      onUpload={(files) => void handleFiles(files)}
    />
  );
}

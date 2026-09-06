"use client";

import { usePublisher } from "@mdxeditor/gurx";
import { useState } from "react";

import { insertJsx$ } from "@myblog/mdx-editor";

import { MediaInsertMenu } from "@/components/admin/MediaInsertMenu";
import { uploadAdminFiles } from "@/lib/client/upload";

function insertAudio(insertJsx: (payload: unknown) => void, src: string) {
  insertJsx({
    kind: "flow",
    name: "Audio",
    props: { src },
  });
}

export function InsertAudio() {
  const insertJsx = usePublisher(insertJsx$ as never);
  const [busy, setBusy] = useState(false);

  async function handleFiles(files: FileList) {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      const uploaded = await uploadAdminFiles(Array.from(files), "audio", undefined, {
        defer: true,
      });
      for (const item of uploaded) {
        insertAudio(insertJsx, item.original.url);
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "音频上传失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <MediaInsertMenu
      accept="audio/mpeg,audio/mp4,audio/aac,audio/ogg,audio/wav,audio/webm,.mp3,.m4a,.aac,.ogg,.opus,.wav,.weba"
      busy={busy}
      kind="audio"
      label="音频"
      onLink={(url) => insertAudio(insertJsx, url)}
      onPick={(item) => insertAudio(insertJsx, item.original.url)}
      onUpload={(files) => void handleFiles(files)}
    />
  );
}

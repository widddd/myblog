"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getNodeByKey } from "lexical";
import { useEffect } from "react";

import { ensureMediaDrop, mediaDragStart } from "@/components/admin/media-drag";

type AdminImageToolbarProps = {
  nodeKey: string;
  imageSource: string;
  title: string;
  alt: string;
};

export function AdminImageToolbar({
  nodeKey,
  imageSource,
}: AdminImageToolbarProps) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    ensureMediaDrop(editor);
  }, [editor]);

  return (
    <div className="admin-media-handle">
      <span
        className="admin-media-handle__grip"
        draggable
        onDragStart={(event) => mediaDragStart(event, nodeKey)}
        title="按住拖动到文章其他位置"
      >
        拖动
      </span>
      <span className="admin-media-handle__src" title={imageSource}>
        图片
      </span>
      <button
        className="admin-toolbar-button"
        onClick={() => {
          editor.update(() => {
            $getNodeByKey(nodeKey)?.remove();
          });
        }}
        type="button"
      >
        删除
      </button>
    </div>
  );
}

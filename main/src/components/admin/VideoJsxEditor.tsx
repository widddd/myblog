"use client";

import { useEffect, useRef, useState } from "react";

import {
  useLexicalNodeRemove,
  useMdastNodeUpdater,
  useNestedEditorContext,
  type JsxEditorProps,
} from "@myblog/mdx-editor";

import { ensureMediaDrop, mediaDragStart } from "@/components/admin/media-drag";
import { uploadAdminFile } from "@/lib/client/upload";
import { isSafeMediaUrl, mediaSourceHost } from "@/lib/media/url";

type JsxAttribute = {
  type?: string;
  name?: string;
  value?: unknown;
};

function readStringAttr(mdastNode: unknown, name: string): string | undefined {
  if (!mdastNode || typeof mdastNode !== "object" || !("attributes" in mdastNode)) {
    return undefined;
  }

  const attributes = (mdastNode as { attributes?: JsxAttribute[] }).attributes;
  if (!Array.isArray(attributes)) {
    return undefined;
  }

  const value = attributes.find((attribute) => attribute.name === name)?.value;
  return typeof value === "string" ? value : undefined;
}

function withSrc(mdastNode: unknown, src: string): JsxAttribute[] {
  const attributes =
    mdastNode && typeof mdastNode === "object" && "attributes" in mdastNode
      ? ([
          ...(((mdastNode as { attributes?: JsxAttribute[] }).attributes ??
            []) as JsxAttribute[]),
        ] as JsxAttribute[])
      : [];
  const index = attributes.findIndex((attribute) => attribute.name === "src");
  const next: JsxAttribute = {
    type: "mdxJsxAttribute",
    name: "src",
    value: src,
  };
  if (index >= 0) {
    attributes[index] = next;
  } else {
    attributes.unshift(next);
  }
  return attributes;
}

export function VideoJsxEditor({ mdastNode }: JsxEditorProps) {
  const { parentEditor, lexicalNode } = useNestedEditorContext();
  const updateMdastNode = useMdastNodeUpdater();
  const removeNode = useLexicalNodeRemove();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [linkMode, setLinkMode] = useState(false);
  const [link, setLink] = useState("");
  const src = readStringAttr(mdastNode, "src");
  const playable = Boolean(src && isSafeMediaUrl(src));
  const host = src ? mediaSourceHost(src) : null;

  useEffect(() => {
    ensureMediaDrop(parentEditor);
  }, [parentEditor]);

  function applySrc(next: string) {
    updateMdastNode({
      attributes: withSrc(mdastNode, next),
    });
  }

  async function replaceWith(file: File | undefined) {
    if (!file || busy) {
      return;
    }
    setBusy(true);
    try {
      const uploaded = await uploadAdminFile(file, "video");
      applySrc(uploaded.original.url);
      setLinkMode(false);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "视频更换失败");
    } finally {
      setBusy(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  function applyLink() {
    const next = link.trim();
    if (!isSafeMediaUrl(next) || !next.startsWith("https://")) {
      window.alert("请填写 https:// 开头的外链");
      return;
    }
    applySrc(next);
    setLink("");
    setLinkMode(false);
  }

  return (
    <div className="admin-video-block">
      <div className="admin-media-handle">
        <span
          className="admin-media-handle__grip"
          draggable
          onDragStart={(event) => mediaDragStart(event, lexicalNode.getKey())}
          title="按住拖动到文章其他位置"
        >
          拖动
        </span>
        <span className="admin-media-handle__src" title={src}>
          {host ? `外链 · ${host}` : "视频"}
        </span>
        <button
          className="admin-toolbar-button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          {busy ? "上传中…" : "上传"}
        </button>
        <button
          className="admin-toolbar-button"
          disabled={busy}
          onClick={() => setLinkMode((current) => !current)}
          type="button"
        >
          外链
        </button>
        <button
          className="admin-toolbar-button"
          disabled={busy}
          onClick={() => removeNode()}
          type="button"
        >
          删除
        </button>
      </div>
      {playable ? (
        <video
          className="post-video"
          controls
          playsInline
          preload="metadata"
          src={src}
        />
      ) : (
        <p className="admin-video-missing">
          {src ? "视频地址无效，请更换文件或外链" : "尚未选择视频"}
        </p>
      )}
      {host ? <p className="post-video-mark">外链 · {host}</p> : null}
      {linkMode ? (
        <div className="admin-media-insert__link">
          <input
            onChange={(event) => setLink(event.target.value)}
            placeholder="https://"
            value={link}
          />
          <button onClick={applyLink} type="button">
            应用
          </button>
        </div>
      ) : null}
      <input
        accept="video/mp4,video/webm,.mp4,.webm"
        hidden
        onChange={(event) => void replaceWith(event.target.files?.[0])}
        ref={inputRef}
        type="file"
      />
    </div>
  );
}

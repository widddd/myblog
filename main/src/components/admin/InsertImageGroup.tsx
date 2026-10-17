"use client";

import { usePublisher } from "@mdxeditor/gurx";
import { useRef, useState } from "react";

import { insertJsx$ } from "@myblog/mdx-editor";

import { AdminDialog } from "@/components/admin/AdminDialog";
import { MediaLibraryPicker } from "@/components/admin/MediaLibraryPicker";
import { registerLocalPreviews } from "@/lib/client/local-preview";
import {
  editorImageUrl,
  uploadAdminFiles,
  UploadCancelledError,
  type AdminUploadResult,
} from "@/lib/client/upload";
import { IMAGE_GROUP_NAME, IMAGE_GROUP_TITLE_MAX } from "@/lib/markdown/image-group";

/** 一张图 → mdast 的「一个段落包一张图」（与手写 markdown 图片同构）。 */
function imageParagraph(file: AdminUploadResult) {
  return {
    type: "paragraph" as const,
    children: [
      { type: "image" as const, url: editorImageUrl(file), alt: "" },
    ],
  };
}

/**
 * 工具栏「折叠组」：从媒体库选多张（或本地上传）→ 一次插入
 * `<ImageGroup title="…">` 并把选中的图放进组里。
 *
 * 也可以只插一个空组：光标点进组内的嵌套编辑区后，工具栏的「图片」按钮插进去的就是组内
 * （插入落到当前聚焦的编辑器，`insertDecoratorNode$` 的行为，见 docs/albums-spec.md §3.4）。
 */
export function InsertImageGroup() {
  const insertJsx = usePublisher(insertJsx$ as never);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [libraryMode, setLibraryMode] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function close() {
    setOpen(false);
    setLibraryMode(false);
    setError("");
    setTitle("");
  }

  function insert(children: ReturnType<typeof imageParagraph>[]) {
    const trimmed = title.trim().slice(0, IMAGE_GROUP_TITLE_MAX);
    insertJsx({
      kind: "flow",
      name: IMAGE_GROUP_NAME,
      props: trimmed ? { title: trimmed } : {},
      children,
    });
    close();
  }

  async function handleFiles(files: FileList) {
    if (busy) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const selected = Array.from(files);
      const uploaded = await uploadAdminFiles(selected, "image", undefined, {
        defer: true,
      });
      // 与本机文件一一对应地登记 blob 预览（折叠组里的图同样不该为预览回源一次）
      registerLocalPreviews(selected, uploaded.map(editorImageUrl));
      insert(uploaded.map(imageParagraph));
    } catch (caught) {
      if (caught instanceof UploadCancelledError) {
        return;
      }
      setError(caught instanceof Error ? caught.message : "图片上传失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-media-insert">
      <button
        aria-haspopup="dialog"
        className="admin-toolbar-button"
        onClick={() => {
          setOpen(true);
          setLibraryMode(false);
          setError("");
        }}
        title="把一批图片折叠成一组（读者点开才展开）"
        type="button"
      >
        折叠组
      </button>
      <AdminDialog onClose={close} open={open} title="插入折叠组" wide={libraryMode}>
        <p className="admin-dialog__lead">
          选中的图片会放进一个可折叠的组里：前台默认收起，读者点「花期 · 2 张」才展开。
          组跟相册没有关系——同一批图在这篇成组、在那篇也可以不成组。
        </p>
        <label className="admin-field">
          组标题（可留空）
          <input
            autoFocus
            maxLength={IMAGE_GROUP_TITLE_MAX}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：花期"
            value={title}
          />
        </label>

        <div className="admin-media-dialog__actions is-triple">
          <button
            className="admin-btn"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            {busy ? "上传中…" : "从本地上传"}
          </button>
          <button
            className="admin-btn admin-btn--ghost"
            disabled={busy}
            onClick={() => {
              setLibraryMode(true);
              setError("");
            }}
            type="button"
          >
            从媒体库选图
          </button>
          <button
            className="admin-btn admin-btn--ghost"
            disabled={busy}
            onClick={() => insert([])}
            type="button"
          >
            先插入空组
          </button>
        </div>

        {libraryMode ? (
          <MediaLibraryPicker
            disabled={busy}
            kinds={["image"]}
            onPickMany={(files) => insert(files.map(imageParagraph))}
          />
        ) : null}

        {error ? (
          <p className="admin-error" role="alert">
            {error}
          </p>
        ) : null}
      </AdminDialog>
      <input
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        hidden
        multiple
        onChange={(event) => {
          if (event.target.files?.length) {
            void handleFiles(event.target.files);
          }
          event.currentTarget.value = "";
        }}
        ref={inputRef}
        type="file"
      />
    </div>
  );
}

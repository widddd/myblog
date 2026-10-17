"use client";

import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  codeBlockPlugin,
  codeMirrorPlugin,
  CreateLink,
  DiffSourceToggleWrapper,
  diffSourcePlugin,
  headingsPlugin,
  imagePlugin,
  InsertCodeBlock,
  InsertTable,
  InsertThematicBreak,
  jsxPlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  ListsToggle,
  markdownShortcutPlugin,
  MDXEditor,
  quotePlugin,
  Separator,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo,
} from "@myblog/mdx-editor";

import { AdminImageToolbar } from "@/components/admin/AdminImageToolbar";
import { editorZhTranslation } from "@/components/admin/editor-i18n";
import { AudioJsxEditor } from "@/components/admin/AudioJsxEditor";
import { ImageGroupJsxEditor } from "@/components/admin/ImageGroupJsxEditor";
import { InsertAudio } from "@/components/admin/InsertAudio";
import { InsertImageGroup } from "@/components/admin/InsertImageGroup";
import { InsertImages } from "@/components/admin/InsertImages";
import { InsertVideo } from "@/components/admin/InsertVideo";
import { VideoJsxEditor } from "@/components/admin/VideoJsxEditor";
import { editorImageUrl, uploadAdminFile } from "@/lib/client/upload";
import { registerLocalPreview, resolveLocalPreview } from "@/lib/client/local-preview";
import { IMAGE_GROUP_NAME } from "@/lib/markdown/image-group";

import type { EditorLoaderProps } from "./EditorLoader";

const VIDEO_DESCRIPTOR = {
  name: "Video",
  kind: "flow" as const,
  props: [
    { name: "src", type: "string" as const, required: true },
    { name: "poster", type: "string" as const },
    { name: "title", type: "string" as const },
    { name: "width", type: "number" as const },
    { name: "height", type: "number" as const },
  ],
  hasChildren: false,
  Editor: VideoJsxEditor,
};

/**
 * 正文折叠组。**必须注册**：编辑器遇到没登记的 JSX 组件会直接抛
 * `No JSX descriptor found for …`（整页打不开），老文章里已经写着 <ImageGroup> 时尤其要命。
 */
const IMAGE_GROUP_DESCRIPTOR = {
  name: IMAGE_GROUP_NAME,
  kind: "flow" as const,
  props: [{ name: "title", type: "string" as const }],
  hasChildren: true,
  Editor: ImageGroupJsxEditor,
};

const AUDIO_DESCRIPTOR = {
  name: "Audio",
  kind: "flow" as const,
  props: [
    { name: "src", type: "string" as const, required: true },
    { name: "title", type: "string" as const },
  ],
  hasChildren: false,
  Editor: AudioJsxEditor,
};

/**
 * 正文图片的预览地址改写：写进 markdown 的永远是服务端地址（保存/发布要它），
 * 但**刚在本机选过的图**手里就有 blob，预览直接用它——不然编辑器会为了显示
 * 立刻回头去服务器把刚上传的原图再拉一遍（见 lib/client/local-preview.ts）。
 *
 * 必须定义在模块作用域：`imagePlugin({ imagePreviewHandler })` 每次渲染都会把新函数
 * pub 进 realm，而 `ImageEditor` 的预览 effect 依赖它 —— 每次新建函数会让每个图片节点
 * 重跑一遍 effect。
 */
async function resolveEditorImagePreview(src: string): Promise<string> {
  return resolveLocalPreview(src) ?? src;
}

async function uploadEditorImage(file: File): Promise<string> {
  const uploaded = await uploadAdminFile(file, "image", undefined, {
    defer: true,
  });
  const url = editorImageUrl(uploaded);
  registerLocalPreview(file, url);
  return url;
}

export default function MdxEditorClient({
  markdown,
  onChange,
  readOnly = false,
}: EditorLoaderProps) {
  return (
    <MDXEditor
      className="admin-mdx-editor mdxeditor-full-height"
      contentEditableClassName="admin-mdx-prose"
      markdown={markdown}
      onChange={onChange}
      placeholder="开始写作…"
      translation={editorZhTranslation}
      plugins={[
        headingsPlugin(),
        listsPlugin(),
        quotePlugin(),
        thematicBreakPlugin(),
        linkPlugin(),
        linkDialogPlugin(),
        tablePlugin(),
        markdownShortcutPlugin(),
        codeBlockPlugin({ defaultCodeBlockLanguage: "txt" }),
        codeMirrorPlugin({
          codeBlockLanguages: {
            txt: "Plain Text",
            js: "JavaScript",
            ts: "TypeScript",
            tsx: "TSX",
            css: "CSS",
            json: "JSON",
            bash: "Bash",
            markdown: "Markdown",
          },
        }),
        imagePlugin({
          imageUploadHandler: uploadEditorImage,
          imagePreviewHandler: resolveEditorImagePreview,
          EditImageToolbar: AdminImageToolbar,
        }),
        jsxPlugin({ jsxComponentDescriptors: [VIDEO_DESCRIPTOR, AUDIO_DESCRIPTOR, IMAGE_GROUP_DESCRIPTOR] }),
        diffSourcePlugin({ viewMode: "rich-text" }),
        toolbarPlugin({
          toolbarContents: () => (
            <DiffSourceToggleWrapper options={["rich-text", "source"]}>
              <UndoRedo />
              <Separator />
              <BoldItalicUnderlineToggles />
              <Separator />
              <ListsToggle />
              <BlockTypeSelect />
              <Separator />
              <span aria-hidden="true" className="admin-mdx-toolbar-break" />
              <CreateLink />
              <InsertImages />
              <InsertImageGroup />
              <InsertVideo />
              <InsertAudio />
              <InsertTable />
              <InsertThematicBreak />
              <InsertCodeBlock />
            </DiffSourceToggleWrapper>
          ),
        }),
      ]}
      readOnly={readOnly}
    />
  );
}

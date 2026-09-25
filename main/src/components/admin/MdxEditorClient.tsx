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
import { InsertAudio } from "@/components/admin/InsertAudio";
import { InsertImages } from "@/components/admin/InsertImages";
import { InsertVideo } from "@/components/admin/InsertVideo";
import { VideoJsxEditor } from "@/components/admin/VideoJsxEditor";
import { editorImageUrl, uploadAdminFile } from "@/lib/client/upload";

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

async function uploadEditorImage(file: File): Promise<string> {
  const uploaded = await uploadAdminFile(file, "image", undefined, {
    defer: true,
  });
  return editorImageUrl(uploaded);
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
          EditImageToolbar: AdminImageToolbar,
        }),
        jsxPlugin({ jsxComponentDescriptors: [VIDEO_DESCRIPTOR, AUDIO_DESCRIPTOR] }),
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

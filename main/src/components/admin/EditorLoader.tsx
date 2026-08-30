"use client";

import dynamic from "next/dynamic";

export type EditorLoaderProps = {
  markdown: string;
  onChange?: (markdown: string, initialMarkdownNormalize?: boolean) => void;
  readOnly?: boolean;
};

const MdxEditorClient = dynamic(() => import("./MdxEditorClient"), {
  ssr: false,
  loading: () => <p className="admin-editor-loading">编辑器加载中…</p>,
});

export function EditorLoader(props: EditorLoaderProps) {
  return <MdxEditorClient {...props} />;
}

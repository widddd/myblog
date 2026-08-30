import type { ComponentType, ReactNode } from "react";

export type RealmPlugin = object;

export type MDXEditorMethods = {
  getMarkdown: () => string;
  setMarkdown: (markdown: string) => void;
  insertMarkdown: (markdown: string) => void;
  focus: (
    callbackFn?: () => void,
    opts?: { defaultSelection?: "rootStart" | "rootEnd"; preventScroll?: boolean },
  ) => void;
};

export type MDXEditorProps = {
  markdown: string;
  onChange?: (markdown: string, initialMarkdownNormalize?: boolean) => void;
  plugins?: RealmPlugin[];
  className?: string;
  contentEditableClassName?: string;
  readOnly?: boolean;
  placeholder?: ReactNode;
  translation?: (
    key: string,
    defaultValue: string,
    interpolations?: Record<string, string | number>,
  ) => string;
};

export const MDXEditor: ComponentType<MDXEditorProps>;

export function headingsPlugin(options?: unknown): RealmPlugin;
export function listsPlugin(options?: unknown): RealmPlugin;
export function quotePlugin(): RealmPlugin;
export function thematicBreakPlugin(): RealmPlugin;
export function linkPlugin(options?: unknown): RealmPlugin;
export function linkDialogPlugin(options?: unknown): RealmPlugin;
export function tablePlugin(): RealmPlugin;
export function markdownShortcutPlugin(): RealmPlugin;
export function codeBlockPlugin(options?: unknown): RealmPlugin;
export function codeMirrorPlugin(options?: unknown): RealmPlugin;
export function diffSourcePlugin(options?: unknown): RealmPlugin;
export function toolbarPlugin(options: {
  toolbarContents: () => ReactNode;
  toolbarClassName?: string;
  toolbarPosition?: "top" | "bottom";
}): RealmPlugin;

export type ImageUploadHandler = ((image: File) => Promise<string>) | null;

export function imagePlugin(options?: {
  imageUploadHandler?: ImageUploadHandler;
  disableImageResize?: boolean;
  EditImageToolbar?: ComponentType<{
    nodeKey: string;
    imageSource: string;
    initialImagePath: string | null;
    title: string;
    alt: string;
    width?: number | "inherit";
    height?: number | "inherit";
  }>;
}): RealmPlugin;

export const insertMarkdown$: unknown;
export const insertImage$: unknown;
export const insertJsx$: unknown;

export function useMdastNodeUpdater<T = unknown>(): (
  node: Partial<T>,
) => void;
export function useLexicalNodeRemove(): () => void;
export function useNestedEditorContext(): {
  parentEditor: import("lexical").LexicalEditor;
  lexicalNode: { getKey: () => string };
  mdastNode: unknown;
};

export type JsxPropertyDescriptor = {
  name: string;
  type: "string" | "number" | "expression";
  required?: boolean;
};

export type JsxEditorProps = {
  mdastNode: unknown;
  descriptor: JsxComponentDescriptor;
};

export type JsxComponentDescriptor = {
  name: string | null;
  kind: "flow" | "text";
  source?: string;
  defaultExport?: boolean;
  props: JsxPropertyDescriptor[];
  hasChildren?: boolean;
  Editor: ComponentType<JsxEditorProps>;
};

export function jsxPlugin(options?: {
  jsxComponentDescriptors?: JsxComponentDescriptor[];
}): RealmPlugin;

export const GenericJsxEditor: ComponentType<JsxEditorProps>;

export const UndoRedo: ComponentType;
export const BoldItalicUnderlineToggles: ComponentType;
export const ListsToggle: ComponentType;
export const BlockTypeSelect: ComponentType;
export const CreateLink: ComponentType;
export const InsertImage: ComponentType;
export const InsertTable: ComponentType;
export const InsertThematicBreak: ComponentType;
export const InsertCodeBlock: ComponentType;
export const CodeToggle: ComponentType;
export const HighlightToggle: ComponentType;
export const DiffSourceToggleWrapper: ComponentType<{
  children?: ReactNode;
  options?: Array<"rich-text" | "diff" | "source">;
}>;
export const Separator: ComponentType;

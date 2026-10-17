"use client";

import type { MdxJsxFlowElement } from "mdast-util-mdx-jsx";
import { useState } from "react";

import {
  NestedLexicalEditor,
  useLexicalNodeRemove,
  useMdastNodeUpdater,
  type JsxEditorProps,
} from "@myblog/mdx-editor";

import {
  IMAGE_GROUP_TITLE_MAX,
  readImageGroupTitle,
  type MarkdownNode,
} from "@/lib/markdown/image-group";

/**
 * 正文里的「折叠组」在编辑器里的样子（`<ImageGroup title="…">…</ImageGroup>`）。
 *
 * 富文本态：一行标题输入 + 组内嵌套编辑区（图片在组里照常拖、照常删）；
 * 源码态：还是那对 JSX 标签，作者可以手写。
 *
 * 标题**在失焦/回车时才写回 mdast**：每敲一个字就写回会让装饰节点重渲染、输入框丢焦点。
 * 删组用 `useLexicalNodeRemove()`（组内内容一起删，编辑器自带的撤销可以救回来）。
 */
export function ImageGroupJsxEditor({ mdastNode }: JsxEditorProps) {
  const node = mdastNode as MdxJsxFlowElement;
  const updateMdastNode = useMdastNodeUpdater<MdxJsxFlowElement>();
  const removeNode = useLexicalNodeRemove();
  const [title, setTitle] = useState(() =>
    readImageGroupTitle(node as unknown as MarkdownNode),
  );

  function commitTitle(next: string) {
    const trimmed = next.trim().slice(0, IMAGE_GROUP_TITLE_MAX);
    const attributes = node.attributes.filter(
      (attribute) =>
        !(attribute.type === "mdxJsxAttribute" && attribute.name === "title"),
    );
    if (trimmed) {
      attributes.unshift({ type: "mdxJsxAttribute", name: "title", value: trimmed });
    }
    updateMdastNode({ attributes });
  }

  return (
    <div className="admin-mdx-group">
      <div className="admin-mdx-group__head" contentEditable={false}>
        <span className="admin-mdx-group__tag">折叠组</span>
        <input
          className="admin-mdx-group__title"
          maxLength={IMAGE_GROUP_TITLE_MAX}
          onBlur={(event) => commitTitle(event.target.value)}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitTitle(event.currentTarget.value);
              event.currentTarget.blur();
            }
          }}
          placeholder="组标题（例如：花期）"
          value={title}
        />
        <button
          className="admin-btn admin-btn--link admin-btn--sm"
          onClick={() => removeNode()}
          type="button"
        >
          删除整组
        </button>
      </div>
      <div className="admin-mdx-group__body">
        <NestedLexicalEditor<MdxJsxFlowElement>
          block
          contentEditableProps={{ className: "admin-mdx-prose" }}
          getContent={(current) => current.children}
          getUpdatedMdastNode={(current, children) =>
            ({
              ...current,
              children: children as MdxJsxFlowElement["children"],
            }) as MdxJsxFlowElement
          }
        />
      </div>
    </div>
  );
}

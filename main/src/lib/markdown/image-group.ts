/**
 * 文章正文里的「折叠组」：`<ImageGroup title="花期">…</ImageGroup>` → 一个**大写标签**的 HAST 元素。
 *
 * 为什么必须有这一步（和 `<Video />` 必须过 `rehypeAllowVideo` 同源）：
 * `rehype-sanitize` 对**认不出的节点类型**返回 `undefined`，于是未转换的 MDX JSX 节点
 * 会**整棵静默消失**——正文里那段内容凭空不见，控制台一行报错都没有。
 * 所以本插件必须排在 `rehypeSanitize` **之前**，把 JSX 节点变成真的 HAST 元素。
 *
 * **为什么转出来的标签名是大写的 `ImageGroup`**（这条踩过坑，别改回小写标签）：
 * MDX 把标签名分两类处理（`@mdx-js/mdx` 的 `recma-jsx-rewrite`）——
 *   ① 大写开头 = **组件**：从 `components` 里取，能映射到 React 组件；
 *   ② 小写开头 = **HTML 标签**：只有"markdown 自己产出的"才会去查 `components`，
 *      **由显式 JSX 转出来的会被特意跳过**（源码注释：`Do not turn explicit JSX into
 *      components from _components`，判据是节点上的 `_mdxExplicitJsx` 标记）。
 * 折叠组本来就是用户写的显式 JSX，转成小写的 `details` 就会落进 ② 的例外分支——
 * 前台渲染成**原生 `<details>`**、`components.details` 形同虚设（实测如此）。
 * 用大写名走 ①，`components.ImageGroup` 就能正常接住（`mdx.tsx` 里注册）。
 * 代价：`sanitizeSchema.tagNames` 必须放行 `ImageGroup`，否则元素被消毒剥掉。
 *
 * 标签本身不是 DOM 元素——它一定会被 `components.ImageGroup` 换成 React 组件；
 * 万一哪条链路没注册组件，MDX 会拿 `undefined` 当组件类型**当场报错**（响亮地坏，
 * 比静默渲染成裸标签好排查）。
 *
 * 本文件是纯转换（不 import react / next / prisma），可直接单测，见 image-group.test.ts。
 */

/** 正文里使用的组件名（编辑器描述符、渲染转换、测试三处共用）。 */
export const IMAGE_GROUP_NAME = "ImageGroup";

/** 转换后写进 `tagName` 的名字：大写 → MDX 按"组件"处理，见文件头说明。 */
export const IMAGE_GROUP_TAG = "ImageGroup";

/** 转换后挂的类名。**必须在 `sanitizeSchema.attributes` 里给 `ImageGroup` 放行 className**，否则会被剥掉（组件就认不出来，退回兜底路径）。 */
export const IMAGE_GROUP_CLASS = "post-image-group";

/** 折叠组标题长度上限（摘要只占一行，超长直接截断，不做换行）。 */
export const IMAGE_GROUP_TITLE_MAX = 80;

/** 没写 title 时的摘要前缀。 */
export const IMAGE_GROUP_FALLBACK_TITLE = "图片组";

/** 与 toc.ts / sanitize.ts 同构的最小树节点：只描述本文件真正用到的字段。 */
export type MarkdownNode = {
  type: string;
  name?: string | null;
  tagName?: string;
  value?: unknown;
  attributes?: Array<{ type: string; name?: string; value?: unknown }>;
  properties?: Record<string, unknown>;
  children?: MarkdownNode[];
};

/** 这个节点是不是折叠组（flow / text 两种 JSX 节点都认，避免手写内联时被静默丢掉）。 */
export function isImageGroupNode(node: MarkdownNode): boolean {
  return (
    (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") &&
    node.name === IMAGE_GROUP_NAME
  );
}

/** 读 `title` 属性：只认字符串字面量（`title={"表达式"}` 一律忽略，不给内容开表达式口子）。 */
export function readImageGroupTitle(node: MarkdownNode): string {
  for (const attribute of node.attributes ?? []) {
    if (
      attribute.type === "mdxJsxAttribute" &&
      attribute.name === "title" &&
      typeof attribute.value === "string"
    ) {
      return attribute.value.trim().slice(0, IMAGE_GROUP_TITLE_MAX);
    }
  }
  return "";
}

/** 组内图片张数：数 `img` 元素（markdown 图片进到 HAST 后就是 `element img`）。 */
export function countGroupImages(node: MarkdownNode): number {
  let total = 0;
  const visit = (current: MarkdownNode) => {
    if (current.type === "element" && current.tagName === "img") {
      total += 1;
      return;
    }
    for (const child of current.children ?? []) {
      visit(child);
    }
  };
  visit(node);
  return total;
}

/** 摘要文案：`花期 · 2 张`；没标题用「图片组」；一张图都没有时不写张数。 */
export function imageGroupSummaryText(title: string, count: number): string {
  const heading = title || IMAGE_GROUP_FALLBACK_TITLE;
  return count > 0 ? `${heading} · ${count} 张` : heading;
}

/**
 * 把折叠组节点**就地**改成一个带类名的 `ImageGroup` 元素，内容原样留在 children
 * （标题只写进 `summary` 文本，供组件当无障碍标签读）。
 * 返回摘要文案（测试与调用方都不用再算一遍）。
 */
export function imageGroupToElement(node: MarkdownNode): string {
  const summary = imageGroupSummaryText(
    readImageGroupTitle(node),
    countGroupImages(node),
  );
  const children = node.children ?? [];

  node.type = "element";
  node.tagName = IMAGE_GROUP_TAG;
  node.properties = { className: [IMAGE_GROUP_CLASS] };
  node.children = [
    {
      type: "element",
      tagName: "summary",
      properties: {},
      children: [{ type: "text", value: summary }],
    },
    ...children,
  ];
  delete node.name;
  delete node.attributes;

  return summary;
}

/**
 * rehype 插件：把折叠组转成 `ImageGroup` 元素，并**继续递归子节点**——
 * 组内的 `<Video />` / `<Audio />` 仍要交给后面的 `rehypeAllowVideo` 处理，
 * 转完就 return 的话组里的视频会被 sanitize 一起丢掉。
 */
export function rehypeImageGroups() {
  return (tree: MarkdownNode) => {
    const visit = (node: MarkdownNode) => {
      if (isImageGroupNode(node)) {
        imageGroupToElement(node);
      }
      for (const child of node.children ?? []) {
        visit(child);
      }
    };
    visit(tree);
  };
}

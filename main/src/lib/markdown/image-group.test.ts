/**
 * 折叠组（`<ImageGroup>`）的两件事一起守：
 *
 * 1. **文本层往返稳定**（M0 的验证点）：markdown → mdast → markdown **幂等**，
 *    组名 / title / 组内图片一个都不丢，而且组内内容**不能被缩进成代码块**
 *    （4 个空格起就是 markdown 的缩进代码块，图片会当场变成一行字面量文本）。
 *    编辑器的存盘 / 重开走的就是这条管线（`importMarkdownToLexical` → `exportMarkdownFromLexical`）。
 * 2. **渲染层转换**：`<ImageGroup>` → `<details class="post-image-group"><summary>…`；
 *    组内 `<Video />` 仍要交给 `rehypeAllowVideo`（转完就 return 会把它一起丢给 sanitize 吃掉）。
 *
 * ⚠️ 两个层次的节点形状不一样，别串：
 * - **mdast**（`fromMarkdown` 的产物）：图片是 `{type:"image", url}`，JSX 是 `mdxJsxFlowElement`；
 * - **hast**（remark-rehype 之后、rehype 插件的输入）：图片是 `{type:"element", tagName:"img"}`。
 *   `rehypeImageGroups` 跑在 hast 上，所以「数张数」的断言必须在 hast 形状的树上做。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { fromMarkdown } from "mdast-util-from-markdown";
import { mdxFromMarkdown, mdxToMarkdown } from "mdast-util-mdx";
import { toMarkdown } from "mdast-util-to-markdown";
import { mdxjs } from "micromark-extension-mdxjs";
import rehypeSanitize from "rehype-sanitize";

import {
  countGroupImages,
  imageGroupSummaryText,
  imageGroupToElement,
  IMAGE_GROUP_CLASS,
  IMAGE_GROUP_FALLBACK_TITLE,
  IMAGE_GROUP_NAME,
  IMAGE_GROUP_TAG,
  IMAGE_GROUP_TITLE_MAX,
  isImageGroupNode,
  readImageGroupTitle,
  rehypeImageGroups,
  type MarkdownNode,
} from "./image-group";
import { rehypeAllowVideo, sanitizeSchema } from "./sanitize";

const SAMPLE = [
  `<${IMAGE_GROUP_NAME} title="花期">`,
  "",
  "![a](/api/uploads/images/aa/aaa.webp)",
  "",
  "![b](/api/uploads/images/bb/bbb.webp)",
  "",
  `</${IMAGE_GROUP_NAME}>`,
  "",
  "组后面的正文。",
].join("\n");

/**
 * 解析 / 序列化选项要强制断言一次：项目里同时装着两份 `mdast-util-from-markdown` /
 * `mdast-util-to-markdown`（一份是我们的直接依赖，一份是编辑器那条链带的），
 * 两边的 `Options` 类型互不兼容（`attentionEncodeSurroundingInfo` 之类）。运行时是同一套
 * 行为（实测往返幂等），这里只是把重复依赖的类型 skew 挡在测试文件内部。
 */
function parse(markdown: string): MarkdownNode {
  const options = {
    extensions: [mdxjs()],
    mdastExtensions: [mdxFromMarkdown()],
  } as unknown as Parameters<typeof fromMarkdown>[1];
  return fromMarkdown(markdown, options) as unknown as MarkdownNode;
}

function serialize(tree: MarkdownNode): string {
  const options = {
    extensions: [mdxToMarkdown()],
  } as unknown as Parameters<typeof toMarkdown>[1];
  return toMarkdown(tree as never, options);
}

/** 从树里找出第一个折叠组节点（顺手证明它真的被解析成了 JSX 节点，而不是丢成文本）。 */
function findGroup(tree: MarkdownNode): MarkdownNode {
  let found: MarkdownNode | null = null;
  const visit = (node: MarkdownNode) => {
    if (!found && isImageGroupNode(node)) {
      found = node;
    }
    for (const child of node.children ?? []) {
      visit(child);
    }
  };
  visit(tree);
  const group = found as MarkdownNode | null;
  assert.ok(group, "没解析出 ImageGroup 节点");
  return group;
}

/** hast 形状的一段话包一张图。 */
function paragraphWithImage(src: string): MarkdownNode {
  return {
    type: "element",
    tagName: "p",
    properties: {},
    children: [
      {
        type: "element",
        tagName: "img",
        properties: { src, alt: "" },
        children: [],
      },
    ],
  };
}

/** hast 形状的折叠组（rehype 阶段真实拿到的样子）。 */
function hastGroup(title: string, images: string[]): MarkdownNode {
  return {
    type: "mdxJsxFlowElement",
    name: IMAGE_GROUP_NAME,
    attributes: [{ type: "mdxJsxAttribute", name: "title", value: title }],
    children: images.map(paragraphWithImage),
  };
}

test("折叠组：markdown → mdast → markdown 幂等，组名与图片都不丢", () => {
  const tree = parse(SAMPLE);
  const group = findGroup(tree);

  assert.equal(group.name, IMAGE_GROUP_NAME);
  assert.equal(group.type, "mdxJsxFlowElement");
  assert.equal(readImageGroupTitle(group), "花期");
  assert.equal(group.children?.length, 2, "组内是两个段落（每个段落一张图）");

  const once = serialize(tree);
  const twice = serialize(parse(once));

  assert.equal(twice, once, "二次往返必须完全一致（不然编辑一次就漂一点）");
  assert.match(once, /<ImageGroup title="花期">/);
  assert.match(once, /<\/ImageGroup>/);
  assert.match(once, /!\[a\]\(\/api\/uploads\/images\/aa\/aaa\.webp\)/);
  assert.match(once, /!\[b\]\(\/api\/uploads\/images\/bb\/bbb\.webp\)/);
  assert.match(once, /组后面的正文。/);
});

test("折叠组：组内内容不能被缩进成代码块（4 空格 = 图片变成字面文本）", () => {
  const once = serialize(parse(SAMPLE));
  const body = once.slice(
    once.indexOf("<ImageGroup"),
    once.indexOf("</ImageGroup>"),
  );
  for (const line of body.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    const indent = line.length - line.trimStart().length;
    assert.ok(indent < 4, `组内出现 4 空格缩进（会变成代码块）：${JSON.stringify(line)}`);
  }
});

test("折叠组：转成 ImageGroup 元素 + summary，张数按组内 img 数算", () => {
  const group = hastGroup("花期", ["a", "b"]);
  const summary = imageGroupToElement(group);

  assert.equal(summary, "花期 · 2 张");
  assert.equal(group.type, "element");
  assert.equal(group.tagName, IMAGE_GROUP_TAG);
  assert.deepEqual(group.properties?.className, [IMAGE_GROUP_CLASS]);
  assert.equal(group.name, undefined, "转换后不该再留着 JSX 的 name（否则 sanitize 仍认不出）");
  assert.equal(group.attributes, undefined);

  const [head, ...rest] = group.children ?? [];
  assert.equal(head?.tagName, "summary");
  assert.equal(head?.children?.[0]?.value, "花期 · 2 张");
  assert.equal(rest.length, 2, "组内两个段落要原样留在元素里");
});

test("折叠组：转换后的标签名必须大写，且 sanitize 放行它（否则 components 映射静默失效）", () => {
  // 这条是踩坑换来的：MDX 只给**大写开头**的名字查 components，
  // 小写标签会被当成"显式 JSX 的 HTML 标签"特意跳过（recma-jsx-rewrite 的 _mdxExplicitJsx 分支），
  // 结果是前台渲染成原生 <details>、组件形同虚设——而且没有任何报错。
  assert.match(
    IMAGE_GROUP_TAG,
    /^[A-Z]/,
    "小写标签名会被 MDX 跳过 components 映射，前台退回原生 HTML 标签",
  );
  assert.ok(
    sanitizeSchema.tagNames?.includes(IMAGE_GROUP_TAG),
    "sanitize 必须放行这个元素名，否则整组连同图片被消毒剥掉",
  );
  assert.deepEqual(sanitizeSchema.attributes?.[IMAGE_GROUP_TAG], ["className"]);
});

test("折叠组：没写标题用「图片组」，一张图都没有时不写张数", () => {
  assert.equal(imageGroupSummaryText("", 3), `${IMAGE_GROUP_FALLBACK_TITLE} · 3 张`);
  assert.equal(imageGroupSummaryText("花期", 0), "花期");
  assert.equal(imageGroupSummaryText("", 0), IMAGE_GROUP_FALLBACK_TITLE);
  assert.equal(imageGroupToElement(hastGroup("", ["a"])), `${IMAGE_GROUP_FALLBACK_TITLE} · 1 张`);
  assert.equal(imageGroupToElement(hastGroup("空组", [])), "空组");
});

test("折叠组：title 截到上限，表达式形式的 title 一律不认", () => {
  const long = "花".repeat(IMAGE_GROUP_TITLE_MAX + 20);
  const withExpression: MarkdownNode = {
    type: "mdxJsxFlowElement",
    name: IMAGE_GROUP_NAME,
    attributes: [
      {
        type: "mdxJsxAttribute",
        name: "title",
        value: { type: "mdxJsxAttributeValueExpression", value: "process.env.X" },
      },
    ],
    children: [],
  };

  assert.equal(readImageGroupTitle(withExpression), "");
  assert.equal(
    readImageGroupTitle({
      type: "mdxJsxFlowElement",
      name: IMAGE_GROUP_NAME,
      attributes: [{ type: "mdxJsxAttribute", name: "title", value: long }],
      children: [],
    }).length,
    IMAGE_GROUP_TITLE_MAX,
  );
});

test("折叠组：插件转成 ImageGroup 元素，组内 Video 仍被后续插件接住", () => {
  const tree: MarkdownNode = {
    type: "root",
    children: [
      {
        type: "mdxJsxFlowElement",
        name: IMAGE_GROUP_NAME,
        attributes: [{ type: "mdxJsxAttribute", name: "title", value: "花期" }],
        children: [
          paragraphWithImage("a"),
          {
            type: "mdxJsxFlowElement",
            name: "Video",
            attributes: [
              { type: "mdxJsxAttribute", name: "src", value: "https://example.com/d.mp4" },
            ],
            children: [],
          },
        ],
      },
      {
        type: "mdxJsxFlowElement",
        name: "SomethingElse",
        attributes: [],
        children: [],
      },
    ],
  };

  rehypeImageGroups()(tree);
  // 顺序与 mdx.tsx 的插件数组一致：折叠组 → 媒体 → sanitize
  rehypeAllowVideo()(tree);
  const sanitize = rehypeSanitize(sanitizeSchema) as unknown as (
    value: MarkdownNode,
  ) => MarkdownNode;
  const result = sanitize(tree);
  const serialized = JSON.stringify(result);

  assert.match(serialized, new RegExp(`"tagName":"${IMAGE_GROUP_TAG}"`));
  assert.match(serialized, /"tagName":"summary"/);
  assert.match(serialized, new RegExp(IMAGE_GROUP_CLASS));
  assert.match(serialized, /花期 · 1 张/);
  assert.match(serialized, /"tagName":"video"/, "组内 Video 不能被吃掉");
  assert.doesNotMatch(serialized, /SomethingElse/, "别的 JSX 不归本插件管");
});

test("折叠组：嵌套组一起转，不会只转外层", () => {
  const inner = hastGroup("内层", []);
  const outer = hastGroup("外层", []);
  outer.children = [...(outer.children ?? []), inner];
  const tree: MarkdownNode = { type: "root", children: [outer] };

  rehypeImageGroups()(tree);

  assert.equal(outer.tagName, IMAGE_GROUP_TAG);
  assert.equal(inner.tagName, IMAGE_GROUP_TAG);
  assert.equal(outer.children?.[1]?.tagName, IMAGE_GROUP_TAG);
});

test("折叠组：非组节点的子内容照常被遍历", () => {
  const group = hastGroup("", []);
  const tree: MarkdownNode = {
    type: "root",
    children: [{ type: "element", tagName: "div", properties: {}, children: [group] }],
  };

  rehypeImageGroups()(tree);

  assert.equal(group.tagName, IMAGE_GROUP_TAG);
  assert.equal(countGroupImages(group), 0);
});

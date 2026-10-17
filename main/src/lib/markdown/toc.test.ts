import assert from "node:assert/strict";
import test from "node:test";

import { collectTocItems, headingDepth, type TocTreeNode } from "./toc";
import { IMAGE_GROUP_CLASS } from "./image-group";

test("headingDepth maps h1–h6 and rejects other tags", () => {
  assert.equal(headingDepth("h1"), 1);
  assert.equal(headingDepth("h6"), 6);
  assert.equal(headingDepth("p"), null);
  assert.equal(headingDepth(undefined), null);
});

test("collectTocItems keeps heading hierarchy and fills missing ids", () => {
  const tree: TocTreeNode = {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "h1",
        properties: {},
        children: [{ type: "text", value: "大标题" }],
      },
      {
        type: "element",
        tagName: "h2",
        properties: { id: "section-two" },
        children: [
          {
            type: "element",
            tagName: "a",
            properties: { href: "#section-two" },
            children: [{ type: "text", value: "小节" }],
          },
        ],
      },
      {
        type: "element",
        tagName: "h3",
        properties: { id: "detail" },
        children: [{ type: "text", value: "细节" }],
      },
      {
        type: "element",
        tagName: "p",
        children: [{ type: "text", value: "不是标题" }],
      },
    ],
  };

  const items = collectTocItems(tree);

  assert.deepEqual(
    items.map((item) => [item.depth, item.text, item.id]),
    [
      [1, "大标题", "heading-1"],
      [2, "小节", "section-two"],
      [3, "细节", "detail"],
    ],
  );
  assert.equal(tree.children?.[0]?.properties?.id, "heading-1");
});

test("折叠组（默认收起的 details）里的标题不进目录", () => {
  const tree: TocTreeNode = {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "h2",
        properties: {},
        children: [{ type: "text", value: "正常标题" }],
      },
      {
        type: "element",
        tagName: "details",
        properties: { className: [IMAGE_GROUP_CLASS] },
        children: [
          {
            type: "element",
            tagName: "summary",
            properties: {},
            children: [{ type: "text", value: "花期 · 2 张" }],
          },
          {
            type: "element",
            tagName: "h3",
            properties: {},
            children: [{ type: "text", value: "组里的标题" }],
          },
        ],
      },
      {
        // 普通的 details（不是折叠组）不归本规则管
        type: "element",
        tagName: "details",
        properties: {},
        children: [
          {
            type: "element",
            tagName: "h4",
            properties: {},
            children: [{ type: "text", value: "别的折叠块标题" }],
          },
        ],
      },
    ],
  };

  assert.deepEqual(
    collectTocItems(tree).map((item) => item.text),
    ["正常标题", "别的折叠块标题"],
  );
});

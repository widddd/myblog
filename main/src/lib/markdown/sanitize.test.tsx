import assert from "node:assert/strict";
import test from "node:test";
import rehypeSanitize from "rehype-sanitize";

import { rehypeAllowVideo, sanitizeSchema } from "./sanitize";

test("MDX sanitizer removes active nodes and preserves safe Video props", () => {
  const tree = {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "script",
        properties: {},
        children: [{ type: "text", value: "script-ran" }],
      },
      {
        type: "element",
        tagName: "a",
        properties: { href: "javascript:alert(1)" },
        children: [{ type: "text", value: "bad" }],
      },
      {
        type: "element",
        tagName: "img",
        properties: { src: "x", onError: "alert(1)" },
        children: [],
      },
      {
        type: "mdxJsxFlowElement",
        name: "Video",
        attributes: [
          { type: "mdxJsxAttribute", name: "src", value: "https://example.com/demo.mp4" },
          { type: "mdxJsxAttribute", name: "onerror", value: "alert(1)" },
        ],
        children: [],
      },
      { type: "mdxFlowExpression", value: "process.exit()" },
    ],
  };

  rehypeAllowVideo()(tree);
  const sanitize = rehypeSanitize(sanitizeSchema) as unknown as (
    value: typeof tree,
  ) => typeof tree;
  const result = sanitize(tree);
  const serialized = JSON.stringify(result);

  assert.doesNotMatch(serialized, /script-ran|onError|onerror|javascript:|process\.exit/);
  assert.match(serialized, /"tagName":"video"/);
  assert.match(serialized, /"tagName":"figure"/);
  assert.match(serialized, /外链 · example.com/);
  assert.match(serialized, /https:\/\/example\.com\/demo\.mp4/);
});

test("MDX sanitizer drops http video sources", () => {
  const tree = {
    type: "root",
    children: [
      {
        type: "mdxJsxFlowElement",
        name: "Video",
        attributes: [
          { type: "mdxJsxAttribute", name: "src", value: "http://evil.example/x.mp4" },
        ],
        children: [],
      },
    ],
  };

  rehypeAllowVideo()(tree);
  const sanitize = rehypeSanitize(sanitizeSchema) as unknown as (
    value: typeof tree,
  ) => typeof tree;
  const result = sanitize(tree);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /http:\/\/evil\.example/);
});

test("MDX sanitizer preserves safe Audio props and drops http sources", () => {
  const tree = {
    type: "root",
    children: [
      {
        type: "mdxJsxFlowElement",
        name: "Audio",
        attributes: [
          { type: "mdxJsxAttribute", name: "src", value: "https://cdn.example.com/a.mp3" },
          { type: "mdxJsxAttribute", name: "onerror", value: "alert(1)" },
        ],
        children: [],
      },
      {
        type: "mdxJsxFlowElement",
        name: "Audio",
        attributes: [
          { type: "mdxJsxAttribute", name: "src", value: "http://evil.example/x.mp3" },
        ],
        children: [],
      },
    ],
  };

  rehypeAllowVideo()(tree);
  const sanitize = rehypeSanitize(sanitizeSchema) as unknown as (
    value: typeof tree,
  ) => typeof tree;
  const result = sanitize(tree);
  const serialized = JSON.stringify(result);
  assert.match(serialized, /"tagName":"audio"/);
  assert.match(serialized, /https:\/\/cdn\.example\.com\/a\.mp3/);
  assert.doesNotMatch(serialized, /onerror|http:\/\/evil\.example/);
});

test("折叠组：details/summary 只放行 className，其它属性一律剥掉", () => {
  const tree = {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "details",
        properties: {
          className: ["post-image-group"],
          onClick: "alert(1)",
          style: "color:red",
        },
        children: [
          {
            type: "element",
            tagName: "summary",
            properties: { className: ["fold-head"], onClick: "alert(2)" },
            children: [{ type: "text", value: "花期 · 2 张" }],
          },
        ],
      },
    ],
  };

  const sanitize = rehypeSanitize(sanitizeSchema) as unknown as (
    value: typeof tree,
  ) => typeof tree;
  const serialized = JSON.stringify(sanitize(tree));

  assert.match(serialized, /"tagName":"details"/);
  assert.match(serialized, /"tagName":"summary"/);
  assert.match(serialized, /post-image-group/);
  assert.match(serialized, /花期 · 2 张/);
  assert.doesNotMatch(serialized, /onClick|onclick|alert\(|color:red/);
});

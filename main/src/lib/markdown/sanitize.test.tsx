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

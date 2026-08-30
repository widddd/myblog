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

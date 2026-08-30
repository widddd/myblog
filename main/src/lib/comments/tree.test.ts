import assert from "node:assert/strict";
import test from "node:test";

import { buildCommentTree, isHoneypotFilled } from "./tree";

test("honeypot treats whitespace as empty and text as filled", () => {
  assert.equal(isHoneypotFilled(undefined), false);
  assert.equal(isHoneypotFilled(""), false);
  assert.equal(isHoneypotFilled("   "), false);
  assert.equal(isHoneypotFilled("http://spam.test"), true);
});

test("comment tree keeps two levels and drops deeper rows", () => {
  const tree = buildCommentTree([
    {
      id: 1,
      nickname: "alice",
      content: "<script>alert(1)</script>",
      isAdmin: false,
      createdAt: "2026-08-29T00:00:00.000Z",
      parentId: null,
    },
    {
      id: 2,
      nickname: "bob",
      content: "reply",
      isAdmin: false,
      createdAt: "2026-08-29T00:01:00.000Z",
      parentId: 1,
    },
    {
      id: 3,
      nickname: "carol",
      content: "too deep",
      isAdmin: false,
      createdAt: "2026-08-29T00:02:00.000Z",
      parentId: 2,
    },
  ]);

  assert.equal(tree.length, 1);
  assert.equal(tree[0]?.content, "<script>alert(1)</script>");
  assert.equal(tree[0]?.replies.length, 1);
  assert.equal(tree[0]?.replies[0]?.nickname, "bob");
  assert.equal(tree[0]?.replies[0]?.replies.length, 0);
});

test("comment tree isolates roots that do not share parent", () => {
  const tree = buildCommentTree([
    {
      id: 10,
      nickname: "a",
      content: "post",
      isAdmin: false,
      createdAt: "2026-08-29T00:00:00.000Z",
      parentId: null,
    },
    {
      id: 11,
      nickname: "b",
      content: "board",
      isAdmin: false,
      createdAt: "2026-08-29T00:00:00.000Z",
      parentId: null,
    },
  ]);
  assert.equal(tree.length, 2);
  assert.equal(tree[0]?.id, 10);
  assert.equal(tree[1]?.id, 11);
});

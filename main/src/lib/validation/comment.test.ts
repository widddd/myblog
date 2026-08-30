import assert from "node:assert/strict";
import test from "node:test";

import { guestCommentSchema } from "./comment";

test("guest comment schema keeps XSS payload as plain text", () => {
  const parsed = guestCommentSchema.parse({
    targetType: "post",
    targetId: 1,
    nickname: "<img onerror=alert(1)>",
    content: "<script>alert(1)</script>",
  });
  assert.equal(parsed.nickname, "<img onerror=alert(1)>");
  assert.equal(parsed.content, "<script>alert(1)</script>");
});

test("guest comment schema rejects invalid email and empty content", () => {
  const email = guestCommentSchema.safeParse({
    targetType: "board",
    targetId: 0,
    nickname: "访客",
    email: "not-an-email",
    content: "hello",
  });
  assert.equal(email.success, false);

  const empty = guestCommentSchema.safeParse({
    targetType: "board",
    targetId: 0,
    nickname: "访客",
    content: "   ",
  });
  assert.equal(empty.success, false);
});

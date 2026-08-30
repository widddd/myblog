import assert from "node:assert/strict";
import test from "node:test";

import {
  createPostUnlockToken,
  verifyPostUnlockToken,
} from "./unlock";

const secret = "test-secret-that-is-at-least-32-characters-long";

test("post unlock token binds slug and expiry", () => {
  const token = createPostUnlockToken("locked-garden", 2_000, secret);
  assert.equal(
    verifyPostUnlockToken(token, "locked-garden", 1_000, secret),
    true,
  );
  assert.equal(verifyPostUnlockToken(token, "another-post", 1_000, secret), false);
  assert.equal(
    verifyPostUnlockToken(token, "locked-garden", 2_000, secret),
    false,
  );
});

test("post unlock token rejects tampering", () => {
  const token = createPostUnlockToken("locked-garden", 2_000, secret);
  const replacement = token.endsWith("0") ? "1" : "0";
  const tampered = `${token.slice(0, -1)}${replacement}`;
  assert.equal(
    verifyPostUnlockToken(tampered, "locked-garden", 1_000, secret),
    false,
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultEncryptEnabled,
  isHttpsEndpoint,
} from "./encrypt-defaults";

test("COS HTTPS defaults encryption off; other cases default on", () => {
  assert.equal(defaultEncryptEnabled(true), false);
  assert.equal(defaultEncryptEnabled(false), true);
});

test("isHttpsEndpoint only accepts https URLs", () => {
  assert.equal(isHttpsEndpoint("https://bucket.cos.ap-shanghai.myqcloud.com"), true);
  assert.equal(isHttpsEndpoint("http://example.com"), false);
  assert.equal(isHttpsEndpoint(""), false);
  assert.equal(isHttpsEndpoint("not-a-url"), false);
});

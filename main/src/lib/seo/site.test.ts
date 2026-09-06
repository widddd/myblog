import assert from "node:assert/strict";
import test from "node:test";

import { normalizeSiteOrigin } from "./site";

test("normalizeSiteOrigin accepts https and localhost http", () => {
  assert.equal(normalizeSiteOrigin("https://blog.example.com/"), "https://blog.example.com");
  assert.equal(normalizeSiteOrigin("http://localhost:3000"), "http://localhost:3000");
  assert.equal(normalizeSiteOrigin("http://evil.example"), null);
  assert.equal(normalizeSiteOrigin("javascript:alert(1)"), null);
});

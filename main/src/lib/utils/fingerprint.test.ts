import assert from "node:assert/strict";
import test from "node:test";

import { getClientIp } from "./fingerprint";

test("getClientIp prefers x-real-ip over spoofed X-Forwarded-For", () => {
  const headers = new Headers({
    "x-forwarded-for": "1.2.3.4, 10.0.0.8",
    "x-real-ip": "203.0.113.9",
  });
  assert.equal(getClientIp(headers), "203.0.113.9");
});

test("getClientIp uses the last X-Forwarded-For hop", () => {
  const headers = new Headers({
    "x-forwarded-for": "1.2.3.4, 198.51.100.20",
  });
  assert.equal(getClientIp(headers), "198.51.100.20");
});

test("getClientIp ignores malformed forwarded values", () => {
  const headers = new Headers({
    "x-forwarded-for": "not-an-ip, <script>",
  });
  assert.equal(getClientIp(headers), "unknown");
});

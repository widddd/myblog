import assert from "node:assert/strict";
import test from "node:test";

import { buildCosPublicBaseUrl, objectPublicUrl } from "./cos-config";

test("buildCosPublicBaseUrl uses bucket and region when custom is empty", () => {
  assert.equal(
    buildCosPublicBaseUrl("bloginbackup-1300644088", "ap-shanghai", ""),
    "https://bloginbackup-1300644088.cos.ap-shanghai.myqcloud.com",
  );
});

test("buildCosPublicBaseUrl accepts https custom domain and strips slash", () => {
  assert.equal(
    buildCosPublicBaseUrl("bucket-1", "ap-shanghai", "https://cdn.example.com/"),
    "https://cdn.example.com",
  );
});

test("objectPublicUrl encodes path segments", () => {
  assert.equal(
    objectPublicUrl(
      "https://bucket.cos.ap-shanghai.myqcloud.com",
      "media/images/abc-original.jpg",
    ),
    "https://bucket.cos.ap-shanghai.myqcloud.com/media/images/abc-original.jpg",
  );
});

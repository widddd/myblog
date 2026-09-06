import assert from "node:assert/strict";
import test from "node:test";

import {
  ARTICLE_SEGMENT,
  isCanonicalPostName,
  isPublicId,
  postHref,
  postPathName,
} from "./path";
import { createPublicId } from "./public-id";

test("publicId is 8 base62 characters", () => {
  const id = createPublicId();
  assert.equal(id.length, 8);
  assert.equal(isPublicId(id), true);
  assert.equal(isPublicId("welcome"), false);
  assert.equal(isPublicId("a3Kx9m2Q"), true);
});

test("postHref uses the slug or article", () => {
  assert.equal(
    postHref({ publicId: "a3Kx9m2Q", slug: "welcome-to-myblog" }),
    "/posts/a3Kx9m2Q/welcome-to-myblog",
  );
  assert.equal(
    postHref({ publicId: "a3Kx9m2Q", slug: "" }),
    `/posts/a3Kx9m2Q/${ARTICLE_SEGMENT}`,
  );
  assert.equal(postPathName("  "), ARTICLE_SEGMENT);
  assert.equal(isCanonicalPostName("welcome", "welcome"), true);
  assert.equal(isCanonicalPostName("wrong", "welcome"), false);
});

import assert from "node:assert/strict";
import test from "node:test";

import { escapeLike, likePattern } from "./escape";

test("escapeLike treats LIKE wildcards as literals", () => {
  assert.equal(escapeLike("100%_off"), "100\\%\\_off");
  assert.equal(escapeLike("a\\b"), "a\\\\b");
  assert.equal(likePattern("hi_"), "%hi\\_%");
});

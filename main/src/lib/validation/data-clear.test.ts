import assert from "node:assert/strict";
import test from "node:test";

import { dataClearPostSchema } from "./data-clear";

test("data clear confirmation requires the exact selected scope", () => {
  const valid = dataClearPostSchema.safeParse({
    targets: ["admin", "data"],
    confirmation: "删除数据和管理员账号",
    acknowledged: true,
  });
  assert.equal(valid.success, true);
  if (valid.success) {
    assert.deepEqual(valid.data.targets, ["data", "admin"]);
  }

  assert.equal(
    dataClearPostSchema.safeParse({
      targets: ["data"],
      confirmation: "删除数据和管理员账号",
      acknowledged: true,
    }).success,
    false,
  );
  assert.equal(
    dataClearPostSchema.safeParse({
      targets: ["data", "data"],
      confirmation: "删除数据",
      acknowledged: true,
    }).success,
    false,
  );
  assert.equal(
    dataClearPostSchema.safeParse({
      targets: ["data"],
      confirmation: "删除数据",
      acknowledged: false,
    }).success,
    false,
  );
});

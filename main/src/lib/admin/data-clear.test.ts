import assert from "node:assert/strict";
import test from "node:test";

import { DataClearError } from "./errors";
import {
  cancelPendingDataClear,
  createPendingDataClear,
  executePendingDataClear,
} from "./data-clear";

test("data clear token cannot execute before the server deadline and can be cancelled", async () => {
  const now = Date.now();
  const operation = createPendingDataClear(9001, ["data"], now);
  assert.equal(operation.executeAt, now + 15_000);
  assert.equal(operation.targets[0], "data");

  await assert.rejects(
    () => executePendingDataClear(operation.operationId, 9001, now + 14_999),
    (error: unknown) =>
      error instanceof DataClearError && error.code === "WAIT_REQUIRED",
  );

  cancelPendingDataClear(operation.operationId, 9001, now + 14_999);
  await assert.rejects(
    () => executePendingDataClear(operation.operationId, 9001, now + 15_000),
    (error: unknown) =>
      error instanceof DataClearError && error.code === "CLEAR_NOT_FOUND",
  );
});

test("data clear token is bound to its administrator", () => {
  const operation = createPendingDataClear(9002, ["admin"], Date.now());
  assert.throws(
    () => cancelPendingDataClear(operation.operationId, 9003),
    (error: unknown) =>
      error instanceof DataClearError && error.code === "FORBIDDEN",
  );
  cancelPendingDataClear(operation.operationId, 9002);
});

import assert from "node:assert/strict";
import test from "node:test";

import { adminRecoverySchema, initialSetupSchema } from "./setup";

test("admin recovery schema only needs account credentials", () => {
  const parsed = adminRecoverySchema.safeParse({
    username: "restored-admin",
    password: "correct-password",
    passwordConfirm: "correct-password",
  });
  assert.equal(parsed.success, true);

  assert.equal(
    adminRecoverySchema.safeParse({
      username: "restored-admin",
      password: "short",
      passwordConfirm: "short",
    }).success,
    false,
  );
  assert.equal(
    adminRecoverySchema.safeParse({
      username: "restored-admin",
      password: "correct-password",
      passwordConfirm: "different-password",
    }).success,
    false,
  );
});

test("initial setup does not require a backup passphrase", () => {
  assert.equal(
    initialSetupSchema.safeParse({
      siteName: "My site",
      username: "admin",
      password: "correct-password",
      passwordConfirm: "correct-password",
    }).success,
    true,
  );
});

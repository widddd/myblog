import assert from "node:assert/strict";
import test from "node:test";

import { backupRunPostSchema, restorePostSchema } from "./backup";

/** 取出口令（顺带断言整体通过），避免在联合类型上直接摸 .data。 */
function runPassphrase(result: ReturnType<typeof backupRunPostSchema.safeParse>) {
  assert.equal(result.success, true);
  if (!result.success) {
    throw new Error("unreachable");
  }
  return result.data.passphrase;
}

function restoreData(result: ReturnType<typeof restorePostSchema.safeParse>) {
  assert.equal(result.success, true);
  if (!result.success) {
    throw new Error("unreachable");
  }
  return result.data;
}

// 2026-10-01 用户实测：加密关闭（默认）时点「立即备份」永远 400，
// 报的是 Zod 默认类型错误 `Invalid input: expected string, received undefined`。
// 客户端空口令时发的是 `{}`（`passphrase || undefined` 会被 JSON.stringify 丢掉），
// 而 run 路由的注释本来就写着「空 body 对非加密备份是合法的」——两边对不上。
test("不加密备份：不带口令（空 body）必须通过", () => {
  assert.equal(runPassphrase(backupRunPostSchema.safeParse({})), undefined);
});

test("不加密备份：口令为空串或纯空白时按「没给」处理", () => {
  for (const value of ["", "   ", "\t"]) {
    assert.equal(
      runPassphrase(backupRunPostSchema.safeParse({ passphrase: value })),
      undefined,
      `passphrase=${JSON.stringify(value)} 应视为未提供`,
    );
  }
});

test("口令太短要说人话，不能漏出 Zod 默认错误", () => {
  const parsed = backupRunPostSchema.safeParse({ passphrase: "1234567" });
  assert.equal(parsed.success, false);
  if (parsed.success) {
    throw new Error("unreachable");
  }
  const message = parsed.error.issues[0]?.message ?? "";
  assert.match(message, /至少 8 个字符/);
  assert.doesNotMatch(message, /Invalid input/);
});

test("合规口令原样通过，并去掉首尾空白", () => {
  assert.equal(
    runPassphrase(backupRunPostSchema.safeParse({ passphrase: "  correct-horse  " })),
    "correct-horse",
  );
});

// 同一类 bug 的第二个入口：恢复非加密包时，客户端也不发 passphrase。
test("恢复：不加密的包不带口令必须通过", () => {
  const data = restoreData(
    restorePostSchema.safeParse({
      name: "myblog-20261001-120000.tar.gz",
      confirm: true,
    }),
  );
  assert.equal(data.passphrase, undefined);
  assert.equal(data.name, "myblog-20261001-120000.tar.gz");
});

test("恢复：文件名与确认位仍然必须合法", () => {
  assert.equal(
    restorePostSchema.safeParse({ name: "../../etc/passwd", confirm: true }).success,
    false,
  );
  assert.equal(
    restorePostSchema.safeParse({ name: "myblog-20261001-120000.tar.gz", confirm: false })
      .success,
    false,
  );
});

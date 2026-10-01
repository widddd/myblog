/**
 * 「模型没进客户端」这条链路的守卫测试。
 *
 * 要守住的是一句话：模型缺失时**不能再退化成 `Cannot read properties of undefined
 * (reading 'findMany')`**——那是 2026-10 静态页面后台的真实报错（dev server 比
 * `prisma generate` 起得早），用户与 AI 都得回头翻代码才知道根因。这里不需要数据库，
 * 直接喂假客户端。
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { requirePrismaModel, SchemaNotReadyError } from "./db-schema";

const ADVICE = "重启开发服务器（pnpm dev）即可。";

test("模型存在时原样返回同一个委托（不复制、不包装）", () => {
  const delegate = { findMany: () => [] };
  const client = { staticPage: delegate, setting: {} };

  assert.equal(requirePrismaModel(client, "staticPage", ADVICE), delegate);
});

test("模型缺失时抛 SchemaNotReadyError，带 code/status 与可照做的建议", () => {
  // 注意：node:assert 的 throws() 返回 undefined，错误对象要在断言函数里取。
  assert.throws(
    () => requirePrismaModel({ setting: {} }, "staticPage", ADVICE),
    (error: unknown) => {
      assert.ok(error instanceof SchemaNotReadyError);
      assert.equal(error.code, "SCHEMA_MISSING");
      assert.equal(error.status, 500);
      // 说清是哪个模型 + 该怎么办，这两条缺一条就得回去翻代码。
      assert.match(error.message, /staticPage/);
      assert.match(error.message, /pnpm dev/);
      return true;
    },
  );
});

test("回归：模型缺失时按旧写法链式调用，先撞上我们的错误而不是 TypeError", () => {
  // 这就是当时的报错代码帧：prisma.staticPage.findMany(...)
  assert.throws(
    () =>
      requirePrismaModel<{ findMany: () => unknown }>(
        {},
        "staticPage",
        ADVICE,
      ).findMany(),
    (error: unknown) => error instanceof SchemaNotReadyError,
  );
});

test("客户端本身是 null/undefined 时走同一分支，不抛别的错", () => {
  for (const client of [null, undefined]) {
    assert.throws(
      () => requirePrismaModel(client, "staticPage", ADVICE),
      SchemaNotReadyError,
    );
  }
});

test("委托是 falsy 而非缺失时同样拦住（客户端可能把它置空）", () => {
  assert.throws(
    () => requirePrismaModel({ staticPage: null }, "staticPage", ADVICE),
    SchemaNotReadyError,
  );
});

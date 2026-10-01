/**
 * 数据清理覆盖守卫：schema 全表 ↔ coverage.ts 清单 ↔ data-clear.ts 里真实的 deleteMany 调用，三方必须一致。
 * 这三样只要有一样落后（新表没登记 / 登记了没删 / 删了没登记），`pnpm test` 就会失败。
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DATA_CLEAR_CONDITIONAL_MODELS,
  DATA_CLEAR_DELETE_ORDER,
  DATA_CLEAR_RETAINED_MODELS,
  prismaDelegateName,
} from "./coverage";

const SCHEMA_URL = new URL("../../../prisma/schema.prisma", import.meta.url);
const DATA_CLEAR_URL = new URL("../admin/data-clear.ts", import.meta.url);

/** `model Post {` → `Post` */
async function readSchemaModels(): Promise<string[]> {
  const source = await readFile(SCHEMA_URL, "utf8");
  return [...source.matchAll(/^model\s+([A-Za-z0-9_]+)\s*\{/gm)].map(
    (match) => match[1] ?? "",
  );
}

/** 先去掉注释，否则被注释掉的 deleteMany 会被当成真的删除（负向验证时踩过） */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** 按出现先后取出 `tx.postTag.deleteMany(` 里的 delegate 名（同一张表出现多次会重复） */
async function readDeleteDelegates(): Promise<string[]> {
  const source = stripComments(await readFile(DATA_CLEAR_URL, "utf8"));
  return [...source.matchAll(/tx\.([A-Za-z0-9_]+)\.deleteMany\(/g)].map(
    (match) => match[1] ?? "",
  );
}

test("schema 里的每张表都在数据清理清单里分好档", async () => {
  const models = await readSchemaModels();
  assert.ok(
    models.length >= 15,
    `schema 只解析出 ${models.length} 张表，正则或文件路径可能已失效`,
  );

  const declared = new Map<string, string>();
  const register = (model: string, kind: string) => {
    assert.ok(
      !declared.has(model),
      `${model} 在 coverage.ts 里登记了多次（${declared.get(model)} 与 ${kind}）`,
    );
    declared.set(model, kind);
  };
  for (const model of DATA_CLEAR_DELETE_ORDER) {
    register(model, "删除");
  }
  for (const entry of DATA_CLEAR_RETAINED_MODELS) {
    register(entry.model, "保留");
  }
  for (const entry of DATA_CLEAR_CONDITIONAL_MODELS) {
    register(entry.model, "按条件删除");
  }

  const missing = models.filter((model) => !declared.has(model));
  assert.deepEqual(
    missing,
    [],
    `以下表在 coverage.ts 里没有分档：${missing.join("、")}——schema 新增表（或清单被误删）时，` +
      "请在 src/lib/data-clear/coverage.ts 登记为删除/保留/按条件删除；" +
      "要删的表同步补进 src/lib/admin/data-clear.ts 的 clearDatabase()（见 P-103）",
  );

  const stale = [...declared.keys()].filter((model) => !models.includes(model));
  assert.deepEqual(
    stale,
    [],
    `coverage.ts 里的 ${stale.join("、")} 在 schema 中已不存在，请删掉对应条目`,
  );
});

test("clearDatabase() 真正删了清单里的每张表，且顺序与清单一致", async () => {
  const delegates = await readDeleteDelegates();
  const unique = [...new Set(delegates)];
  const expectedDeleteOrder = DATA_CLEAR_DELETE_ORDER.map(prismaDelegateName);

  const deletedInCode = unique.filter((name) => expectedDeleteOrder.includes(name));
  assert.deepEqual(
    deletedInCode,
    expectedDeleteOrder,
    "data-clear.ts 的 deleteMany 与 DATA_CLEAR_DELETE_ORDER 不一致：漏删的表要补 deleteMany，" +
      "顺序按依赖排（子表在前、Comment 先删回复、MomentVisibilityGroup 跟在 Moment 后）",
  );

  const conditionalDelegates = DATA_CLEAR_CONDITIONAL_MODELS.map((entry) =>
    prismaDelegateName(entry.model),
  );
  const unexpected = unique.filter(
    (name) => !expectedDeleteOrder.includes(name) && !conditionalDelegates.includes(name),
  );
  assert.deepEqual(
    unexpected,
    [],
    `data-clear.ts 多删了 ${unexpected.join("、")}：这些表要么登记进 coverage.ts，要么改回保留`,
  );
});

test("保留的站点配置与首页模块不会被数据清理删掉", async () => {
  const delegates = new Set(await readDeleteDelegates());
  const retainedInvocations = DATA_CLEAR_RETAINED_MODELS.map(
    (entry) => prismaDelegateName(entry.model),
  ).filter((delegate) => delegates.has(delegate));
  assert.deepEqual(
    retainedInvocations,
    [],
    `保留表被删了：${retainedInvocations.join("、")}（设置与首页模块按 spec §2.1 保留）`,
  );
});

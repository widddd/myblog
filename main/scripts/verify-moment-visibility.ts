/**
 * 瞬间可见范围的 DB 级验证（临时脚本，跑在 scratch 库上，不碰 data/blog.db）：
 * 用真实的 Prisma 查询条件验证「全局可见期 ↔ 可见范围组」的可见性裁决、删除组后的回落、组名唯一约束。
 *
 * 跑法：
 *   $env:DATABASE_URL="file:<scratch>/blog.db"; npx prisma migrate deploy
 *   $env:DATABASE_PATH="<scratch>/blog.db"; npx tsx scripts/verify-moment-visibility.ts
 */
import { PrismaBetterSQLite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient, type Prisma } from "@prisma/client";
import Database from "better-sqlite3";

import { buildMomentVisibilityFilter } from "../src/lib/moments/visibility";

const DATABASE_PATH = process.env.DATABASE_PATH;
if (!DATABASE_PATH) {
  throw new Error("需要 DATABASE_PATH（scratch 库路径）");
}

const sqlite = new Database(DATABASE_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.close();

const prisma = new PrismaClient({
  adapter: new PrismaBetterSQLite3({ url: DATABASE_PATH, timeout: 5_000 }),
});

const DAY = 86_400_000;
const NOW = new Date();
const results: Array<[string, boolean, string]> = [];

function check(name: string, ok: boolean, detail = "") {
  results.push([name, ok, detail]);
}

/** 完整走一遍公开侧入口：同一个 where 喂给 count 和 findMany（与 lib/moments/query.ts 一致） */
async function visibleIds(input: {
  globalDays: number;
  groups: Array<{ id: number; days: number }>;
}) {
  const where = buildMomentVisibilityFilter({ ...input, now: NOW }) as
    | Prisma.MomentWhereInput
    | undefined;
  const rows = await prisma.moment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return rows.map((row) => row.id).sort((a, b) => a - b);
}

async function main() {
  const stamp = Date.now();
  const day3 = await prisma.momentVisibilityGroup.create({
    data: { name: `三天可见组-verify-${stamp}`, days: 3 },
  });
  const day365 = await prisma.momentVisibilityGroup.create({
    data: { name: `一年可见组-verify-${stamp}`, days: 365 },
  });

  const base = NOW.getTime();
  const fresh = await prisma.moment.create({
    data: { content: "verify 1 天前，跟随全局", createdAt: new Date(base - 1 * DAY) },
  });
  const oldGlobal = await prisma.moment.create({
    data: { content: "verify 40 天前，跟随全局", createdAt: new Date(base - 40 * DAY) },
  });
  const oldInShortGroup = await prisma.moment.create({
    data: {
      content: "verify 5 天前 + 3 天组",
      createdAt: new Date(base - 5 * DAY),
      visibilityGroupId: day3.id,
    },
  });
  const oldInLongGroup = await prisma.moment.create({
    data: {
      content: "verify 10 天前 + 一年组",
      createdAt: new Date(base - 10 * DAY),
      visibilityGroupId: day365.id,
    },
  });
  const groupsWithWindows = [
    { id: day3.id, days: 3 },
    { id: day365.id, days: 365 },
  ];
  const legend = `fresh=${fresh.id} oldGlobal=${oldGlobal.id} 短组=${oldInShortGroup.id} 长组=${oldInLongGroup.id}`;

  // 1) 全局 30 天 + 分组各自生效
  const global30 = await visibleIds({ globalDays: 30, groups: groupsWithWindows });
  check(
    "全局 30 天：新发布可见、超全局隐藏、短组已到期隐藏、长组仍可见",
    global30.includes(fresh.id) &&
      !global30.includes(oldGlobal.id) &&
      !global30.includes(oldInShortGroup.id) &&
      global30.includes(oldInLongGroup.id),
    `可见 ids=${JSON.stringify(global30)} [${legend}]`,
  );

  // 2) 全局不限制：组的窗口成为唯一到期规则（旧行为回归：未分组内容不会因此消失）
  const unlimited = await visibleIds({ globalDays: 0, groups: groupsWithWindows });
  check(
    "全局永久：未分组瞬间全部回来，短组那条仍隐藏，长组那条仍可见",
    unlimited.includes(fresh.id) &&
      unlimited.includes(oldGlobal.id) &&
      !unlimited.includes(oldInShortGroup.id) &&
      unlimited.includes(oldInLongGroup.id),
    `可见 ids=${JSON.stringify(unlimited)} [${legend}]`,
  );

  // 3) 全局比组更严：全局是天花板（一年组也必须按全局算）
  const global7 = await visibleIds({ globalDays: 7, groups: groupsWithWindows });
  check(
    "全局 7 天 + 一年组：全局收紧，10 天前的长组瞬间仍被隐藏",
    global7.includes(fresh.id) && !global7.includes(oldInLongGroup.id),
    `可见 ids=${JSON.stringify(global7)} [${legend}]`,
  );

  // 4) 没有任何分组 + 全局不限制 = 不做任何过滤（等于旧行为，全表可见）
  const noFilter = await visibleIds({ globalDays: 0, groups: [] });
  check(
    "全局永久 + 无分组：一条都不该被误伤",
    noFilter.length === 4,
    `可见 ids=${JSON.stringify(noFilter)}`,
  );

  // 5) 删除组 → 外键 SetNull：瞬间回落到全局，不连带删瞬间
  await prisma.momentVisibilityGroup.delete({ where: { id: day3.id } });
  const orphan = await prisma.moment.findUnique({
    where: { id: oldInShortGroup.id },
    select: { visibilityGroupId: true },
  });
  check(
    "删除组后：瞬间还在，visibilityGroupId 被置空",
    orphan !== null && orphan.visibilityGroupId === null,
    JSON.stringify(orphan),
  );
  const afterDelete = await visibleIds({ globalDays: 0, groups: [] });
  check(
    "删除组后按全局（永久）显示，瞬间没有被连带删除",
    afterDelete.includes(oldInShortGroup.id),
    `可见 ids=${JSON.stringify(afterDelete)}`,
  );

  // 6) 组名唯一约束
  const day365Name = await prisma.momentVisibilityGroup.findUnique({
    where: { id: day365.id },
    select: { name: true },
  });
  let sameNameRejected = false;
  try {
    await prisma.momentVisibilityGroup.create({
      data: { name: day365Name?.name ?? "", days: 10 },
    });
  } catch {
    sameNameRejected = true;
  }
  check("组名唯一：重名被数据库拒绝", sameNameRejected);

  await prisma.momentVisibilityGroup.delete({ where: { id: day365.id } }).catch(() => {});

  const failed = results.filter(([, ok]) => !ok);
  for (const [name, ok, detail] of results) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  [${detail}]` : ""}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} 通过`);
  await prisma.$disconnect();
  process.exit(failed.length === 0 ? 0 : 1);
}

void main();

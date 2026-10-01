/**
 * 数据清理的 DB 级验证（临时脚本，跑在 scratch 库上，绝不碰 data/blog.db）：
 * 按 schema 全表铺数据 → 直接调 `lib/admin/data-clear.ts` 的 `clearDatabase()` →
 * 断言内容表清空、保留表（Setting / HomeModule / HomePlacement）原样、返回的计数与铺的条数一致。
 *
 * 只验证数据库这一段：媒体文件、备份包与更新暂存的删除由 `clearStorage()` / `clearFileArtifacts()`
 * 负责，那部分会真的删磁盘文件，不在本脚本里跑。
 *
 * 跑法（在 main/ 下）：
 *   $env:DATABASE_URL="file:<scratch>/blog.db"; npx prisma migrate deploy
 *   $env:DATABASE_PATH="<scratch>/blog.db"; npx tsx scripts/verify-data-clear.ts
 */
import path from "node:path";

const results: Array<[string, boolean, string]> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push([name, ok, detail]);
}

function fail(message: string): never {
  throw new Error(message);
}

async function main() {
  const configured = process.env.DATABASE_PATH?.trim();
  if (!configured) {
    fail("需要 DATABASE_PATH（scratch 库路径），见文件头跑法");
  }
  const scratchPath = path.resolve(configured);
  const livePath = path.resolve(process.cwd(), "data", "blog.db");
  if (scratchPath === livePath) {
    fail(`拒绝在真实库上跑清理验证：${scratchPath}`);
  }
  process.env.DATABASE_PATH = scratchPath;

  const { DATABASE_PATH, prisma } = await import("../src/lib/db");
  const { clearDatabase } = await import("../src/lib/admin/data-clear");
  if (path.resolve(DATABASE_PATH) !== scratchPath) {
    fail(`Prisma 连接的库不是 scratch 库：${DATABASE_PATH}`);
  }
  console.log(`scratch 库：${scratchPath}\n`);

  const stamp = Date.now();
  const keepSettingKey = "verify-clear-keep-setting";
  const keepModuleSlug = `verify-clear-module-${stamp}`;

  // 基线：保留表在清理前后应当一条不差
  const settingsBefore = await prisma.setting.count();
  const homeModulesBefore = await prisma.homeModule.count();
  const homePlacementsBefore = await prisma.homePlacement.count();

  await prisma.setting.create({
    data: { key: keepSettingKey, value: JSON.stringify("保留我") },
  });
  const homeModule = await prisma.homeModule.create({
    data: { slug: keepModuleSlug, name: "清理验证模块", kind: "custom" },
  });
  await prisma.homePlacement.create({
    data: { moduleId: homeModule.id, enabled: true },
  });

  await prisma.adminUser.create({
    data: { username: `verify-admin-${stamp}`, passwordHash: "x", penName: "验证笔名" },
  });
  const category = await prisma.category.create({
    data: { slug: `verify-cat-${stamp}`, name: "验证分类" },
  });
  const tag = await prisma.tag.create({
    data: { slug: `verify-tag-${stamp}`, name: "验证标签" },
  });
  const post = await prisma.post.create({
    data: {
      publicId: `verify-post-${stamp}`,
      slug: `verify-post-${stamp}`,
      title: "验证文章",
      content: "x",
      status: "published",
      categoryId: category.id,
    },
  });
  await prisma.postTag.create({ data: { postId: post.id, tagId: tag.id } });

  const group = await prisma.momentVisibilityGroup.create({
    data: { name: `三天可见组-verify-${stamp}`, days: 3 },
  });
  const moment = await prisma.moment.create({
    data: { content: "验证瞬间", visibilityGroupId: group.id },
  });
  await prisma.momentLike.create({
    data: { momentId: moment.id, fingerprint: `verify-${stamp}` },
  });

  const boardComment = await prisma.comment.create({
    data: { targetType: "board", targetId: 0, nickname: "留言者", content: "留言板" },
  });
  await prisma.comment.create({
    data: {
      targetType: "board",
      targetId: 0,
      nickname: "回复者",
      content: "回复",
      parentId: boardComment.id,
    },
  });
  await prisma.comment.create({
    data: {
      targetType: "post",
      targetId: post.id,
      nickname: "读者",
      content: "文章评论",
    },
  });

  await prisma.upload.create({
    data: {
      hash: `verify-upload-${stamp}`,
      key: `images/original/ff/verify-${stamp}.png`,
      mime: "image/png",
      size: 1024,
    },
  });
  await prisma.backupSecret.create({
    data: { name: "verify", keyHash: `verify-secret-${stamp}` },
  });
  await prisma.penName.create({ data: { name: `验证笔名-${stamp}` } });

  const seeded = {
    posts: await prisma.post.count(),
    categories: await prisma.category.count(),
    tags: await prisma.tag.count(),
    postTags: await prisma.postTag.count(),
    penNames: await prisma.penName.count(),
    moments: await prisma.moment.count(),
    momentLikes: await prisma.momentLike.count(),
    momentVisibilityGroups: await prisma.momentVisibilityGroup.count(),
    comments: await prisma.comment.count(),
    uploads: await prisma.upload.count(),
    backupSecrets: await prisma.backupSecret.count(),
    adminUsers: await prisma.adminUser.count(),
  };
  check(
    "铺数据：内容表与可见范围组、笔名都不是空的（否则后面的 0 没有意义）",
    seeded.posts > 0 &&
      seeded.moments > 0 &&
      seeded.momentVisibilityGroups > 0 &&
      seeded.penNames > 0 &&
      seeded.comments >= 3 &&
      seeded.uploads > 0 &&
      seeded.backupSecrets > 0 &&
      seeded.adminUsers > 0,
    JSON.stringify(seeded),
  );

  // ── 场景 1：只删数据（保留管理员） ────────────────────────────────
  const cleared = await clearDatabase(true, false);

  const after = {
    posts: await prisma.post.count(),
    categories: await prisma.category.count(),
    tags: await prisma.tag.count(),
    postTags: await prisma.postTag.count(),
    penNames: await prisma.penName.count(),
    moments: await prisma.moment.count(),
    momentLikes: await prisma.momentLike.count(),
    momentVisibilityGroups: await prisma.momentVisibilityGroup.count(),
    comments: await prisma.comment.count(),
    uploads: await prisma.upload.count(),
    backupSecrets: await prisma.backupSecret.count(),
    adminUsers: await prisma.adminUser.count(),
  };

  const emptyTables = (
    [
      "posts",
      "categories",
      "tags",
      "postTags",
      "penNames",
      "moments",
      "momentLikes",
      "momentVisibilityGroups",
      "comments",
      "uploads",
      "backupSecrets",
    ] as const
  ).filter((key) => after[key] !== 0);
  check(
    "删除数据后：可见范围组、笔名在内的内容表全部清空",
    emptyTables.length === 0,
    emptyTables.length === 0
      ? `全部为 0（组 ${seeded.momentVisibilityGroups} → 0、笔名 ${seeded.penNames} → 0）`
      : `仍有残留 ${emptyTables.map((key) => `${key}=${after[key]}`).join("、")}`,
  );

  check(
    "只删数据：管理员账号保留",
    after.adminUsers === seeded.adminUsers,
    `adminUsers=${after.adminUsers}`,
  );

  const settingsAfter = await prisma.setting.count();
  const homeModulesAfter = await prisma.homeModule.count();
  const homePlacementsAfter = await prisma.homePlacement.count();
  check(
    "站点配置与首页模块原样保留（含新写入的 1 条）",
    settingsAfter === settingsBefore + 1 &&
      homeModulesAfter === homeModulesBefore + 1 &&
      homePlacementsAfter === homePlacementsBefore + 1,
    `Setting ${settingsBefore}+1=${settingsAfter}、HomeModule ${homeModulesBefore}+1=${homeModulesAfter}、HomePlacement ${homePlacementsBefore}+1=${homePlacementsAfter}`,
  );
  const keptSetting = await prisma.setting.findUnique({
    where: { key: keepSettingKey },
    select: { value: true },
  });
  const keptModule = await prisma.homeModule.findUnique({
    where: { slug: keepModuleSlug },
    select: { id: true },
  });
  check(
    "保留的具体行还在（不是靠空表蒙过去的）",
    keptSetting !== null && keptModule !== null,
    `setting=${JSON.stringify(keptSetting?.value)} moduleId=${keptModule?.id}`,
  );

  check(
    "返回计数与实际铺的条数一致（含新增的 momentVisibilityGroups / penNames）",
    cleared.posts === seeded.posts &&
      cleared.categories === seeded.categories &&
      cleared.tags === seeded.tags &&
      cleared.postTags === seeded.postTags &&
      cleared.penNames === seeded.penNames &&
      cleared.moments === seeded.moments &&
      cleared.momentLikes === seeded.momentLikes &&
      cleared.momentVisibilityGroups === seeded.momentVisibilityGroups &&
      cleared.comments === seeded.comments &&
      cleared.uploads === seeded.uploads &&
      cleared.backupSecrets === seeded.backupSecrets &&
      cleared.admins === 0,
    JSON.stringify(cleared),
  );

  // ── 场景 2：只删管理员（内容不动） ────────────────────────────────
  const post2 = await prisma.post.create({
    data: {
      publicId: `verify-post2-${stamp}`,
      slug: `verify-post2-${stamp}`,
      title: "管理员场景文章",
      content: "x",
      status: "draft",
    },
  });
  const adminOnly = await clearDatabase(false, true);
  const postsAfterAdminClear = await prisma.post.count();
  const adminsAfterAdminClear = await prisma.adminUser.count();
  const settingsAfterAdminClear = await prisma.setting.count();
  check(
    "只删管理员：账号清了、文章与站点配置一条没动",
    adminsAfterAdminClear === 0 &&
      postsAfterAdminClear === 1 &&
      settingsAfterAdminClear === settingsAfter,
    `admins=${adminsAfterAdminClear}、posts=${postsAfterAdminClear}（新文章 ${post2.id}）、settings=${settingsAfterAdminClear}、cleared.admins=${adminOnly.admins}`,
  );

  const failed = results.filter(([, ok]) => !ok);
  for (const [name, ok, detail] of results) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  [${detail}]` : ""}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} 通过`);

  await prisma.$disconnect();
  process.exit(failed.length === 0 ? 0 : 1);
}

void main().catch((error: unknown) => {
  console.error(`验证脚本异常：${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

/**
 * 首页「文章卡片」模块里的瞬间穿插（纯逻辑，无 prisma / react）。
 *
 * 口径（2026-10 用户钦定）：
 * - 瞬间与文章**按时间穿插**：发布时刻更早的排在前面，不再用「每 N 篇插一条」这种固定间隔；
 * - 一页最多放 `momentLimit` 条；比这一页最后一篇文章还早的瞬间属于后面的页，本页不展示；
 * - 同一时刻（极少见）先文章后瞬间，保证顺序稳定。
 */

export type Interleaved<TPost, TMoment> =
  | { kind: "post"; item: TPost }
  | { kind: "moment"; item: TMoment };

export type InterleaveByDateOptions<TPost, TMoment> = {
  postDate: (item: TPost) => Date | string | null;
  momentDate: (item: TMoment) => Date | string | null;
  /** 一页最多放几条瞬间；0 = 不穿插 */
  limit: number;
};

/** 间隔与条数的归一（配置缺失 / 脏值都从这里兜住）。 */
export function normalizeMomentLimit(limit?: number): number {
  const count = Math.round(Number(limit));
  return Number.isFinite(count) && count >= 0 ? Math.min(8, count) : 0;
}

function toTime(value: Date | string | null): number {
  if (!value) {
    return 0;
  }
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

/**
 * 按时间把瞬间插进文章序列。
 * 先取最新的至多 `limit` 条瞬间，再丢掉「比本页最后一篇还早」的那些（它们该出现在后面的页），
 * 最后与文章一起按时间排序 —— 所以本页不保证一定放满 `limit` 条。
 */
export function interleaveByDate<TPost, TMoment>(
  posts: TPost[],
  moments: TMoment[],
  options: InterleaveByDateOptions<TPost, TMoment>,
): Interleaved<TPost, TMoment>[] {
  const limit = normalizeMomentLimit(options.limit);
  if (posts.length === 0) {
    return [];
  }

  const postTimes = posts.map((post) => toTime(options.postDate(post)));
  const oldestPost = Math.min(...postTimes);
  const picked = limit > 0 ? moments.slice(0, limit) : [];

  const entries: Array<{
    kind: "post" | "moment";
    item: TPost | TMoment;
    time: number;
    index: number;
  }> = posts.map((item, index) => ({
    kind: "post",
    item,
    time: postTimes[index] ?? 0,
    index,
  }));

  picked.forEach((item, index) => {
    const time = toTime(options.momentDate(item));
    // 比本页最后一篇还早 → 属于后面的页
    if (time < oldestPost) {
      return;
    }
    entries.push({ kind: "moment", item, time, index });
  });

  entries.sort((a, b) => {
    if (b.time !== a.time) {
      return b.time - a.time; // 新的在前
    }
    if (a.kind !== b.kind) {
      return a.kind === "post" ? -1 : 1;
    }
    return a.index - b.index;
  });

  return entries.map((entry) =>
    entry.kind === "post"
      ? { kind: "post" as const, item: entry.item as TPost }
      : { kind: "moment" as const, item: entry.item as TMoment },
  );
}

import type { AdminMoment } from "@/lib/moments/admin";
import { formatDateTimeSeconds } from "@/lib/utils/date";

/**
 * 后台「瞬间管理」列表的一行。
 *
 * 服务端把展示需要的一切都算好（时间文案、到期时刻、是否过期），
 * 客户端只负责渲染与交互——客户端不重算可见期，避免两套口径。
 */
export type AdminMomentListItem = {
  id: number;
  content: string;
  imageCount: number;
  /** 精确到秒的发布时间文案 */
  createdAtText: string;
  /** 生效可见期短语，例如「3 天（三天可见组）」 */
  visibilityText: string;
  /** 到期时刻文案；永久公开为 null */
  expiresAtText: string | null;
  /** 到期时刻时间戳；永久公开为 null */
  expiresAtMs: number | null;
  /** 该瞬间当前生效的天数，0 = 不限 */
  effectiveDays: number;
  /** 该瞬间当前用的组 id，null = 跟随全局 */
  groupId: number | null;
  /** 该瞬间当前用的组名，null = 跟随全局（或组已被删除） */
  groupName: string | null;
  expired: boolean;
};

/** `listAdminMoments()` 的行 → 列表视图数据（纯函数，无 prisma）。 */
export function buildAdminMomentListItems(
  moments: readonly AdminMoment[],
): AdminMomentListItem[] {
  return moments.map((moment) => ({
    id: moment.id,
    content: moment.content,
    imageCount: moment.images.length,
    createdAtText: formatDateTimeSeconds(moment.createdAt),
    visibilityText: moment.visibilityText,
    expiresAtText: moment.visibility.expiresAt
      ? formatDateTimeSeconds(moment.visibility.expiresAt)
      : null,
    expiresAtMs: moment.visibility.expiresAt?.getTime() ?? null,
    effectiveDays: moment.visibility.effectiveDays,
    groupId: moment.visibility.groupId,
    groupName: moment.visibility.groupName,
    expired: moment.visibility.expired,
  }));
}

"use client";

import { CameraIcon, ClockIcon, LightningBoltIcon } from "@radix-ui/react-icons";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { DeleteButton } from "@/components/admin/DeleteButton";
import { adminJson } from "@/lib/client/admin";
import type { AdminMomentListItem } from "@/lib/moments/admin-list-view";
import { MOMENT_VISIBILITY_UNLIMITED, momentVisibilityDaysLabel } from "@/lib/moments/visibility";
import {
  resolveGroupView,
  type MomentVisibilityGroupView,
} from "@/lib/moments/visibility-group-view";

export function MomentAdminList({
  moments,
  groups,
  globalDays,
  nowMs,
}: {
  moments: AdminMomentListItem[];
  groups: MomentVisibilityGroupView[];
  globalDays: number;
  /** 服务端渲染时刻：保证首屏水合一致，挂载后再按浏览器时间刷新 */
  nowMs: number;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(nowMs);

  useEffect(() => {
    // 首屏用服务端时刻保证水合一致，挂载后再切到浏览器时间并定期刷新剩余时间。
    // 用 setTimeout 而不是在 effect 体里直接 setState（React 不建议同步 setState 触发级联渲染）。
    const initial = window.setTimeout(() => setNow(Date.now()), 0);
    const ticker = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(ticker);
    };
  }, []);

  async function changeGroup(momentId: number, value: string) {
    setBusyId(momentId);
    setError("");
    try {
      await adminJson(`/api/admin/moments/${momentId}`, {
        method: "PATCH",
        body: JSON.stringify({
          visibilityGroupId: value === "" ? null : Number.parseInt(value, 10),
        }),
      });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "修改可见范围失败");
    } finally {
      setBusyId(null);
    }
  }

  if (moments.length === 0) {
    return (
      <div className="admin-empty">
        <span className="admin-empty__ico">
          <LightningBoltIcon width={24} height={24} />
        </span>
        <p>还没有发布任何瞬间</p>
        <p className="admin-muted">来发第一条动态，记录生活吧！</p>
      </div>
    );
  }

  return (
    <div className="moment-admin">
      <p className="admin-muted">
        生效可见期 = min(全局可见期, 该条所用组的天数)。标「已过期」的瞬间前台已看不到，
        但内容、评论与点赞都还在后台；改成更长的组或放宽全局可见期就会重新出现。
      </p>
      {error ? (
        <p className="admin-error" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="admin-moment-list">
        {moments.map((moment, index) => (
          <li
            key={moment.id}
            className="admin-stagger"
            style={{ "--i": index } as React.CSSProperties}
          >
            <div className="admin-moment-content">
              <p>{moment.content}</p>
            </div>
            <div className="admin-moment-meta">
              <span className="admin-moment-time">
                <ClockIcon /> {moment.createdAtText}
              </span>
              {moment.imageCount > 0 && (
                <span className="admin-moment-badge">
                  <CameraIcon /> {moment.imageCount} 张图片
                </span>
              )}
              <span className="admin-moment-badge">{moment.visibilityText}</span>
              {moment.expired ? (
                <span className="admin-badge admin-badge--danger">
                  已过期 · 前台已隐藏
                </span>
              ) : (
                <span className="admin-badge admin-badge--ok">
                  {moment.expiresAtText
                    ? `对外可见 · 到期 ${moment.expiresAtText}`
                    : "永久公开"}
                </span>
              )}
            </div>
            {!moment.expired ? (
              <p className="admin-muted">{remainingText(moment, globalDays, now)}</p>
            ) : null}
            <div className="moment-admin__controls">
              <label className="admin-field">
                可见范围
                <select
                  disabled={busyId === moment.id}
                  onChange={(event) => void changeGroup(moment.id, event.target.value)}
                  value={moment.groupId === null ? "" : String(moment.groupId)}
                >
                  <option value="">
                    跟随全局可见期（{momentVisibilityDaysLabel(globalDays)}）
                  </option>
                  {groups.map((group) => {
                    const view = resolveGroupView(group, globalDays);
                    return (
                      <option key={group.id} value={String(group.id)}>
                        {view.name} · {view.effectiveLabel}
                        {view.cappedByGlobal
                          ? `（组为 ${view.daysLabel}，受全局限制）`
                          : ""}
                      </option>
                    );
                  })}
                </select>
              </label>
              <DeleteButton
                confirmText="确定删除这条瞬间？删除后无法恢复。"
                label="删除"
                url={`/api/admin/moments/${moment.id}`}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 剩余时间文案；只描述"这条自己"的到期情况，全局收紧在短语里已经写明。 */
function remainingText(
  moment: AdminMomentListItem,
  globalDays: number,
  now: number,
): string {
  if (moment.expiresAtMs === null) {
    return "永久公开：只有手动删除或改设置才会从前台消失。";
  }
  const hoursLeft = Math.floor((moment.expiresAtMs - now) / 3_600_000);
  const source =
    moment.groupName === null
      ? "跟随全局可见期"
      : `组「${moment.groupName}」`;
  const cutBy =
    moment.groupName !== null &&
    globalDays !== MOMENT_VISIBILITY_UNLIMITED &&
    moment.effectiveDays === globalDays
      ? "，当前被全局可见期收紧"
      : "";
  const where = `${source}${cutBy}，到期 ${moment.expiresAtText}`;
  if (hoursLeft <= 0) {
    return `${where}：时间已到，前台已隐藏。`;
  }
  if (hoursLeft < 24) {
    return `${where}：还剩约 ${hoursLeft} 小时。`;
  }
  return `${where}：还剩约 ${Math.floor(hoursLeft / 24)} 天。`;
}

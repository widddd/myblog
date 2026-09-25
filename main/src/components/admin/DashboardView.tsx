"use client";

import { Cross2Icon } from "@radix-ui/react-icons";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import {
  DASHBOARD_CARD_META,
  DEFAULT_DASHBOARD_CARDS,
  hasVisibleDashboardCard,
  type DashboardCardKey,
  type DashboardCardZone,
  type DashboardCards,
} from "@/lib/admin/dashboard-cards";
import { adminJson } from "@/lib/client/admin";

type DashboardViewProps = {
  /** 服务端读到的卡片显隐（Setting dashboardCards） */
  cards: DashboardCards;
  /** 每张卡的内容，由概览页（server component）构造后传入 */
  slots: Partial<Record<DashboardCardKey, ReactNode>>;
};

/**
 * 概览页外壳：负责网格分区、卡片角标与空态。
 *
 * - 「隐藏」= **不渲染该卡**（不是 display:none），网格按实际卡片数重算，不留空洞。
 * - 换配色与批量显隐在布局壳顶栏的「外观」面板里；本组件只保留**单卡角标**这一个入口，
 *   两个入口共用同一份 Setting，改完都走 `router.refresh()` 让服务端重新读值。
 * - 概览页渲染本组件时带 `key`（值随 cards 变化），所以服务端新值会重建 state，
 *   不需要 effect 同步——也避免新增 `set-state-in-effect` 类问题。
 */
export function DashboardView({ cards: initialCards, slots }: DashboardViewProps) {
  const router = useRouter();
  const [cards, setCards] = useState<DashboardCards>(initialCards);
  const [pending, setPending] = useState(false);

  async function persist(next: DashboardCards) {
    const previous = cards;
    setCards(next); // 乐观更新
    setPending(true);
    try {
      await adminJson("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({ dashboardCards: next }),
      });
      router.refresh();
    } catch {
      setCards(previous); // 失败回滚，不让 UI 与库里不一致
    } finally {
      setPending(false);
    }
  }

  const zoneCards = (zone: DashboardCardZone) =>
    DASHBOARD_CARD_META.filter((meta) => meta.zone === zone && cards[meta.key]);

  const renderSlot = (key: DashboardCardKey, label: string) => {
    const content = slots[key];
    if (!content) {
      return null;
    }
    return (
      <div className="admin-dash__slot" key={key}>
        {content}
        <button
          aria-label={`隐藏「${label}」`}
          className="admin-dash__hide"
          disabled={pending}
          onClick={() => void persist({ ...cards, [key]: false })}
          title={`隐藏「${label}」`}
          type="button"
        >
          <Cross2Icon />
        </button>
      </div>
    );
  };

  const kpis = zoneCards("kpi");
  const wides = zoneCards("wide");
  const fulls = zoneCards("full");
  const empty = !hasVisibleDashboardCard(cards);

  return (
    <div className="admin-dash">
      {empty ? (
        <div className="admin-empty">
          <h2>所有卡片都已隐藏</h2>
          <p>用顶栏「外观」重新勾选，或直接恢复默认。</p>
          <button
            className="admin-btn admin-btn--primary"
            disabled={pending}
            onClick={() => void persist({ ...DEFAULT_DASHBOARD_CARDS })}
            type="button"
          >
            恢复默认
          </button>
        </div>
      ) : null}

      {kpis.length > 0 ? (
        <div className="admin-dash__kpis">
          {kpis.map((meta) => renderSlot(meta.key, meta.label))}
        </div>
      ) : null}

      {wides.length > 0 ? (
        <div className="admin-dash__wide">
          {wides.map((meta) => renderSlot(meta.key, meta.label))}
        </div>
      ) : null}

      {fulls.length > 0 ? (
        <div className="admin-dash__full">
          {fulls.map((meta) => renderSlot(meta.key, meta.label))}
        </div>
      ) : null}
    </div>
  );
}

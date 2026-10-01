"use client";

import { Cross2Icon } from "@radix-ui/react-icons";
import { useRouter } from "next/navigation";
import { Fragment, useState, type ReactNode } from "react";

import {
  countHiddenDashboardCards,
  DASHBOARD_CARD_META,
  DEFAULT_DASHBOARD_CARDS,
  hasVisibleDashboardCard,
  showAllDashboardCards,
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
 * - 换配色与批量显隐在「外观」面板里（**入口在前台导航栏的「外观」图标** → `/admin?appearance=1`；
 *   后台标题行刻意不放按钮，见 admin.css）。本组件额外保留**单卡角标**与**回头路**两个入口，
 *   三者共用同一份 Setting，改完都走 `router.refresh()` 让服务端重新读值。
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
        {/* 卡片本体由服务端组件造好后传进来，这里必须给它一个 key：
            否则 `[内容, 隐藏按钮]` 这个动态子元素数组在 dev 下会报
            「Each child in a list should have a unique "key" prop（child from AdminDashboardPage）」。
            Fragment 不产生 DOM 节点，`> .admin-card` / `> :not(.admin-dash__hide)` 这些选择器不受影响。 */}
        <Fragment key="card">{content}</Fragment>
        <button
          aria-label={`隐藏「${label}」`}
          className="admin-dash__hide"
          disabled={pending}
          key="hide"
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
  const empty = !hasVisibleDashboardCard(cards);
  const hiddenCount = countHiddenDashboardCards(cards);

  return (
    <div className="admin-dash">
      {empty ? (
        <div className="admin-empty">
          <h2>所有卡片都已隐藏</h2>
          {/* 文案必须写**真实存在**的入口：后台标题行刻意没有「外观」按钮（见 admin.css），
              写成「顶栏「外观」」会把用户指到一个不存在的控件上。 */}
          <p>
            点下面的「恢复默认」全部放出来；想只挑几张，用前台导航栏的「外观」图标
            → 「概览卡片」逐张勾选。
          </p>
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

      {/* 回头路：叉掉任何一张卡都会出现这一行。放在**最后**——放前面会把下面卡片的
          `.admin-dash > *:nth-child()` 入场延迟整体挪位。 */}
      {!empty && hiddenCount > 0 ? (
        <p className="admin-dash__restore">
          已隐藏 {hiddenCount} 张卡片
          <button
            className="admin-btn admin-btn--link"
            disabled={pending}
            onClick={() => void persist(showAllDashboardCards())}
            type="button"
          >
            全部显示
          </button>
        </p>
      ) : null}
    </div>
  );
}

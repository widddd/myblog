"use client";

import { Cross2Icon, ResetIcon } from "@radix-ui/react-icons";
import { AnimatePresence, m } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ADMIN_ACCENTS, type AdminAccentKey } from "@/lib/admin/accents";
import {
  DASHBOARD_CARD_META,
  DEFAULT_DASHBOARD_CARDS,
  type DashboardCards,
} from "@/lib/admin/dashboard-cards";
import { adminJson } from "@/lib/client/admin";
import { cn } from "@/lib/utils/cn";

const EASE = [0.16, 1, 0.3, 1] as const;

type DashboardAppearancePanelProps = {
  /** 开关由布局壳顶栏的按钮控制 */
  open: boolean;
  onClose: () => void;
  /** 服务端读到的当前配色（乐观反馈的基线） */
  accent: AdminAccentKey;
  /** 是否显示「概览卡片」区块 —— 只在概览页有意义 */
  showCards: boolean;
  /** 概览页的卡片显隐（非概览页为 undefined） */
  cards?: DashboardCards;
};

/**
 * 外观面板：由布局壳顶栏的按钮唤出（入口在 `AdminWorkspace`），因此任意后台页面都能换配色；
 * 「概览卡片」区块只在概览页出现。
 *
 * 两个区块作用域不同，UI 上分别标注——否则用户会以为切配色只影响当前页。
 * 读写都走 `/api/admin/settings`，改完 `router.refresh()` 让服务端重新注入 `:root` 锚点
 * 并重新渲染概览页（卡片显隐由服务端读 Setting 决定）。
 */
export function DashboardAppearancePanel({
  open,
  onClose,
  accent,
  showCards,
  cards,
}: DashboardAppearancePanelProps) {
  const router = useRouter();
  const [pendingAccent, setPendingAccent] = useState<AdminAccentKey | null>(null);
  const [pendingCards, setPendingCards] = useState<DashboardCards | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 乐观值优先；router.refresh() 之后传入的 prop 会追上来，两者最终一致。
  const activeAccent = pendingAccent ?? accent;
  const activeCards = pendingCards ?? cards;

  async function put(
    payload: Record<string, unknown>,
    rollback: () => void,
  ) {
    setError(null);
    try {
      await adminJson("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      router.refresh();
    } catch (cause) {
      rollback();
      setError(cause instanceof Error ? cause.message : "保存失败");
    }
  }

  function chooseAccent(key: AdminAccentKey) {
    if (key === activeAccent) {
      return;
    }
    const previous = activeAccent;
    setPendingAccent(key);
    void put({ adminAccent: key }, () => setPendingAccent(previous));
  }

  function applyCards(next: DashboardCards) {
    if (!activeCards) {
      return;
    }
    const previous = activeCards;
    setPendingCards(next);
    void put({ dashboardCards: next }, () => setPendingCards(previous));
  }

  function toggleCard(key: keyof DashboardCards, value: boolean) {
    if (!activeCards) {
      return;
    }
    applyCards({ ...activeCards, [key]: value });
  }

  return (
    <AnimatePresence>
      {open ? (
        <div className="admin-appearance" role="presentation">
          <m.button
            aria-label="关闭"
            className="admin-dialog__backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            transition={{ duration: 0.16, ease: EASE }}
            type="button"
          />
          <m.aside
            aria-label="外观设置"
            className="admin-appearance__panel"
            initial={{ x: 24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 24, opacity: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
            role="dialog"
          >
            <div className="admin-appearance__head">
              <h2>外观</h2>
              <button
                aria-label="关闭"
                className="admin-btn admin-btn--icon"
                onClick={onClose}
                type="button"
              >
                <Cross2Icon />
              </button>
            </div>

            <section className="admin-appearance__group">
              <div className="admin-appearance__group-head">
                <h3>配色</h3>
                <span className="admin-appearance__scope">影响整个后台</span>
              </div>
              <div className="admin-accent-grid">
                {ADMIN_ACCENTS.map((preset) => (
                  <button
                    aria-pressed={activeAccent === preset.key}
                    className={cn(
                      "admin-accent-swatch",
                      activeAccent === preset.key && "is-active",
                    )}
                    key={preset.key}
                    onClick={() => chooseAccent(preset.key)}
                    title={preset.name}
                    type="button"
                  >
                    {/* 色块必须显示该预设自己的颜色，这里的内联色值是必要的例外 */}
                    <i aria-hidden="true" style={{ background: preset.accent }} />
                    <span>{preset.name}</span>
                  </button>
                ))}
              </div>
            </section>

            {showCards && activeCards ? (
              <section className="admin-appearance__group">
                <div className="admin-appearance__group-head">
                  <h3>概览卡片</h3>
                  <span className="admin-appearance__scope">只影响概览页</span>
                </div>
                <div className="admin-appearance__actions">
                  {/* 「全部显示」= 一律全开。**不能复用 DEFAULT_DASHBOARD_CARDS**：
                      那是「恢复默认」的语义，将来默认值未必是全开，两者会被混为一谈。 */}
                  <button
                    className="admin-btn admin-btn--ghost"
                    onClick={() =>
                      applyCards(
                        Object.fromEntries(
                          DASHBOARD_CARD_META.map((meta) => [meta.key, true]),
                        ) as DashboardCards,
                      )
                    }
                    type="button"
                  >
                    全部显示
                  </button>
                  <button
                    className="admin-btn admin-btn--ghost"
                    onClick={() => applyCards({ ...DEFAULT_DASHBOARD_CARDS })}
                    type="button"
                  >
                    <ResetIcon aria-hidden="true" />
                    恢复默认
                  </button>
                </div>
                <div className="admin-card-toggles">
                  {DASHBOARD_CARD_META.map((meta) => (
                    <label className="admin-card-toggle" key={meta.key}>
                      <input
                        checked={activeCards[meta.key]}
                        onChange={(event) =>
                          toggleCard(meta.key, event.target.checked)
                        }
                        type="checkbox"
                      />
                      <span>{meta.label}</span>
                    </label>
                  ))}
                </div>
              </section>
            ) : null}

            {error ? (
              <p className="admin-error" role="alert">
                {error}
              </p>
            ) : null}
          </m.aside>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

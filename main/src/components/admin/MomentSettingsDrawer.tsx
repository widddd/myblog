"use client";

import { AnimatePresence, m } from "motion/react";
import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { MomentVisibilityGroups } from "@/components/admin/MomentVisibilityGroups";
import { MomentVisibilityPanel } from "@/components/admin/MomentVisibilityPanel";
import type { MomentVisibilityPanelData } from "@/lib/moments/compose-types";
import type { MomentVisibilityGroupView } from "@/lib/moments/visibility-group-view";

const ease = [0.16, 1, 0.3, 1] as const;

function subscribeNoop() {
  return () => {};
}

/**
 * 「详细设置」：从画面右侧展开的抽屉。
 * 只放可见范围相关的两块——全局可见期（含预览）+ 可见范围组管理（增删）。
 */
export function MomentSettingsDrawer({
  open,
  onClose,
  data,
  globalDays,
  groups,
}: {
  open: boolean;
  onClose: () => void;
  data: MomentVisibilityPanelData;
  globalDays: number;
  groups: MomentVisibilityGroupView[];
}) {
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  if (!mounted) {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="admin-sheet" role="presentation">
          <m.button
            aria-label="关闭"
            className="admin-sheet__backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            transition={{ duration: 0.16, ease }}
            type="button"
          />
          <m.aside
            aria-label="可见范围详细设置"
            aria-modal="true"
            className="admin-sheet__panel"
            initial={{ x: 32, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 32, opacity: 0 }}
            role="dialog"
            transition={{ duration: 0.22, ease }}
          >
            <header className="admin-sheet__head">
              <h3 className="admin-sheet__title">详细设置</h3>
              <button
                aria-label="关闭"
                className="admin-dialog__close"
                onClick={onClose}
                type="button"
              >
                ×
              </button>
            </header>
            <div className="admin-sheet__body">
              <section className="admin-sheet__block">
                <h4 className="admin-sheet__block-title">全局可见期</h4>
                <MomentVisibilityPanel data={data} />
              </section>
              <div className="admin-section__divider" />
              <section className="admin-sheet__block">
                <h4 className="admin-sheet__block-title">可见范围组</h4>
                <MomentVisibilityGroups globalDays={globalDays} groups={groups} />
              </section>
            </div>
          </m.aside>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

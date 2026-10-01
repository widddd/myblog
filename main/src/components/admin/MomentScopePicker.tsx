"use client";

import { ChevronDownIcon, GearIcon } from "@radix-ui/react-icons";
import { useEffect, useRef, useState } from "react";

import {
  MOMENT_VISIBILITY_UNLIMITED,
  momentVisibilityDaysLabel,
  resolveMomentVisibilityDays,
} from "@/lib/moments/visibility";
import type { MomentVisibilityGroupView } from "@/lib/moments/visibility-group-view";
import { resolveGroupView } from "@/lib/moments/visibility-group-view";

/**
 * 发布区里的「可见范围」按钮：折叠时只显示当前选择，
 * 点开在旁边出现小卡片（永久公开 / 跟随全局 / 各个可见范围组），
 * 卡片底部「详细设置」把右侧详细面板打开。
 */
export function MomentScopePicker({
  globalDays,
  groups,
  value,
  disabled,
  onChange,
  onOpenSettings,
}: {
  globalDays: number;
  groups: MomentVisibilityGroupView[];
  /** "" = 跟随全局；否则是组 id 字符串 */
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onOpenSettings: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = value === "" ? null : groups.find((g) => String(g.id) === value) ?? null;
  const selectedDays = resolveMomentVisibilityDays({
    globalDays,
    groupDays: selected?.days ?? null,
  });
  const label = selected ? selected.name : `${momentVisibilityDaysLabel(globalDays)}`;

  return (
    <div className="moment-compose__scope" ref={rootRef}>
      <button
        aria-haspopup="dialog"
        className="moment-compose__scope-btn"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        title="选择这条瞬间的可见范围"
        type="button"
      >
        <span className="moment-compose__scope-label">{label}</span>
        <ChevronDownIcon width={14} height={14} />
      </button>
      {open ? (
        <div className="moment-compose__pop moment-compose__pop--scope" role="dialog" aria-label="可见范围">
          <p className="moment-compose__pop-title">这条瞬间谁可以看多久</p>
          <label className="moment-compose__pop-item moment-compose__pop-item--choice">
            <input
              checked={value === ""}
              name="momentScope"
              onChange={() => onChange("")}
              type="radio"
            />
            <span>跟随全局设置</span>
            <span className="moment-compose__pop-aside">
              {momentVisibilityDaysLabel(globalDays)}
            </span>
          </label>
          {groups.map((group) => {
            const view = resolveGroupView(group, globalDays);
            return (
              <label
                className="moment-compose__pop-item moment-compose__pop-item--choice"
                key={group.id}
              >
                <input
                  checked={value === String(group.id)}
                  name="momentScope"
                  onChange={() => onChange(String(group.id))}
                  type="radio"
                />
                <span>{group.name}</span>
                <span className="moment-compose__pop-aside">
                  {view.effectiveLabel}
                  {view.cappedByGlobal ? "（受全局限制）" : ""}
                </span>
              </label>
            );
          })}
          {groups.length === 0 ? (
            <p className="moment-compose__pop-hint">
              还没有可见范围组，可在「详细设置」里新建（例如三天可见组）。
            </p>
          ) : null}
          <p className="moment-compose__pop-hint">
            生效可见期：{momentVisibilityDaysLabel(selectedDays)}
            {selected === null
              ? "（跟随全局）"
              : globalDays !== MOMENT_VISIBILITY_UNLIMITED && globalDays < selected.days
                ? "（全局更严，按全局算）"
                : ""}
          </p>
          <div className="moment-compose__pop-foot">
            <button
              className="moment-compose__pop-detail"
              onClick={() => {
                setOpen(false);
                onOpenSettings();
              }}
              type="button"
            >
              <GearIcon width={15} height={15} /> 详细设置
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

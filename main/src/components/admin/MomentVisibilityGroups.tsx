"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAdminConfirm } from "@/components/admin/useAdminConfirm";
import { adminJson } from "@/lib/client/admin";
import {
  MOMENT_VISIBILITY_DAYS_MAX,
  MOMENT_VISIBILITY_GROUP_NAME_MAX,
  MOMENT_VISIBILITY_PRESETS,
  MOMENT_VISIBILITY_UNLIMITED,
  momentVisibilityDaysLabel,
  normalizeVisibilityDays,
} from "@/lib/moments/visibility";
import {
  resolveGroupView,
  type MomentVisibilityGroupView,
} from "@/lib/moments/visibility-group-view";

type Props = {
  globalDays: number;
  groups: MomentVisibilityGroupView[];
};

const PRESET_DAYS = MOMENT_VISIBILITY_PRESETS as readonly number[];

type GroupListView = {
  globalDays: number;
  groups: MomentVisibilityGroupView[];
};

export function MomentVisibilityGroups({ globalDays, groups }: Props) {
  const router = useRouter();
  const { confirm, dialog } = useAdminConfirm();
  const [name, setName] = useState("");
  const [daysOption, setDaysOption] = useState<string>("7");
  const [customDays, setCustomDays] = useState("45");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const wantsCustom = daysOption === "custom";
  const customValue = Number.parseInt(customDays, 10);
  const customValid =
    Number.isInteger(customValue) && customValue >= 1 && customValue <= MOMENT_VISIBILITY_DAYS_MAX;
  const createDays = wantsCustom
    ? customValid
      ? customValue
      : 0
    : normalizeVisibilityDays(Number.parseInt(daysOption, 10));
  const canCreate =
    name.trim().length > 0 && createDays >= 1 && !busy;

  /** 服务端已经写好了，这里让服务端组件重新渲染（列表 + 全局可见期都会跟着更新）。 */
  function refreshView() {
    router.refresh();
  }

  async function handleCreate() {
    setError("");
    if (!canCreate) {
      return;
    }
    setBusy("create");
    try {
      await adminJson<GroupListView>("/api/admin/moment-groups", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), days: createDays }),
      });
      setName("");
      refreshView();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建失败");
    } finally {
      setBusy("");
    }
  }

  async function handleDelete(group: MomentVisibilityGroupView) {
    setError("");
    setBusy(`delete-${group.id}`);
    try {
      const preview = await adminJson<{
        name: string;
        affectedMoments: number;
        fallbackNote: string;
      }>(`/api/admin/moment-groups/${group.id}`);
      const lines = [
        `确定删除可见范围组「${preview.name}」？`,
        preview.affectedMoments > 0
          ? `有 ${preview.affectedMoments} 条瞬间在用这个组：${preview.fallbackNote}。`
          : "暂时没有瞬间在用这个组。",
      ];
      if (!(await confirm(lines.join("\n")))) {
        return;
      }
      const view = await adminJson<GroupListView>(
        `/api/admin/moment-groups/${group.id}`,
        { method: "DELETE" },
      );
      void view;
      refreshView();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="moment-visibility">
      <p className="admin-muted">
        可见范围组是发瞬间时能直接选的档位，例如「三天可见组」「7 天可见组」「1 个月可见组」。
        全局可见期是天花板：组比全局长时，实际还是按全局生效（列表里会标出来）。
        删除组不会删瞬间，用它的瞬间会回落到全局可见期。
      </p>

      {groups.length === 0 ? (
        <p className="admin-muted">
          还没有可见范围组，先在下面建一个（例如「三天可见组」= 3 天）。
        </p>
      ) : (
        <ul className="moment-group-list">
          {groups.map((group) => {
            const view = resolveGroupView(group, globalDays);
            return (
              <li className="moment-group" key={group.id}>
                <span className="moment-group__name">{view.name}</span>
                <span className="admin-badge">{view.daysLabel}</span>
                <span className="admin-badge admin-badge--muted">
                  实际 {view.effectiveLabel}
                </span>
                {view.cappedByGlobal ? (
                  <span className="admin-muted">受全局 {globalDays} 天限制</span>
                ) : null}
                <span className="moment-group__spacer" />
                <button
                  className="admin-btn admin-btn--danger admin-btn--sm"
                  disabled={busy === `delete-${group.id}`}
                  onClick={() => void handleDelete(group)}
                  type="button"
                >
                  {busy === `delete-${group.id}` ? "删除中…" : "删除"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="moment-group-create">
        <label className="admin-field">
          组名
          <input
            maxLength={MOMENT_VISIBILITY_GROUP_NAME_MAX}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleCreate();
              }
            }}
            placeholder="例如：三天可见组"
            value={name}
          />
        </label>
        <label className="admin-field">
          可见天数
          <select
            onChange={(event) => setDaysOption(event.target.value)}
            value={daysOption}
          >
            {PRESET_DAYS.map((value) => (
              <option key={value} value={String(value)}>
                {momentVisibilityDaysLabel(value)}（{value} 天）
              </option>
            ))}
            <option value="custom">自定义…</option>
          </select>
        </label>
        {wantsCustom ? (
          <label className="admin-field">
            自定义天数
            <input
              max={MOMENT_VISIBILITY_DAYS_MAX}
              min={1}
              onChange={(event) => setCustomDays(event.target.value)}
              step={1}
              type="number"
              value={customDays}
            />
          </label>
        ) : null}
        <button
          className="admin-btn"
          disabled={!canCreate}
          onClick={() => void handleCreate()}
          type="button"
        >
          {busy === "create" ? "创建中…" : "新建可见范围组"}
        </button>
      </div>

      {wantsCustom && !customValid ? (
        <p className="admin-muted">自定义天数需为 1–{MOMENT_VISIBILITY_DAYS_MAX} 的整数</p>
      ) : null}
      {globalDays === MOMENT_VISIBILITY_UNLIMITED ? (
        <p className="admin-muted">当前全局可见期为「永久公开」，组是唯一的到期规则。</p>
      ) : null}
      {error ? (
        <p className="admin-error" role="alert">
          {error}
        </p>
      ) : null}
      {dialog}
    </div>
  );
}

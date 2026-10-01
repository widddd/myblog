"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { adminJson } from "@/lib/client/admin";
import type { MomentVisibilityPanelData } from "@/lib/moments/compose-types";
import {
  MOMENT_VISIBILITY_PRESETS,
  MOMENT_VISIBILITY_UNLIMITED,
  momentVisibilityDaysLabel,
  normalizeVisibilityDays,
} from "@/lib/moments/visibility";

type Mode = "unlimited" | "preset" | "custom";

const PRESET_DAYS = MOMENT_VISIBILITY_PRESETS as readonly number[];

function modeOf(days: number): Mode {
  if (days === MOMENT_VISIBILITY_UNLIMITED) {
    return "unlimited";
  }
  return PRESET_DAYS.includes(days) ? "preset" : "custom";
}

/**
 * 全局可见期：改哪个档位就立刻保存（抽屉里没有"保存"按钮的位置，
 * 也符合"点一下立刻生效"的预期），保存结果显示在下方一行小字里。
 */
export function MomentVisibilityPanel({ data }: { data: MomentVisibilityPanelData }) {
  const router = useRouter();
  const savedDays = normalizeVisibilityDays(data.initialDays);
  const [mode, setMode] = useState<Mode>(() => modeOf(savedDays));
  const [preset, setPreset] = useState(() =>
    modeOf(savedDays) === "preset" ? savedDays : 7,
  );
  const [custom, setCustom] = useState(() =>
    modeOf(savedDays) === "custom" ? String(savedDays) : "45",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const customDays = Number.parseInt(custom, 10);
  const customValid =
    Number.isInteger(customDays) &&
    customDays >= data.minDays &&
    customDays <= data.maxDays;

  const days = useMemo(() => {
    if (mode === "unlimited") {
      return MOMENT_VISIBILITY_UNLIMITED;
    }
    if (mode === "preset") {
      return preset;
    }
    return customValid ? customDays : savedDays;
  }, [customDays, customValid, mode, preset, savedDays]);

  const dirty = days !== savedDays;
  const unlimited = days === MOMENT_VISIBILITY_UNLIMITED;
  const preview = data.previewLabels[String(days)] ?? "";

  async function save(next: number) {
    setError("");
    setNotice("");
    if (next === savedDays) {
      return;
    }
    setSaving(true);
    try {
      const payload = await adminJson<{ momentVisibleDays?: number }>(
        "/api/admin/settings",
        {
          method: "PUT",
          body: JSON.stringify({ momentVisibleDays: next }),
        },
      );
      normalizeVisibilityDays(payload.momentVisibleDays ?? next);
      setNotice(`已保存：${momentVisibilityDaysLabel(next)}，前台立即生效`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="moment-visibility">
      <p className="admin-muted">
        整站瞬间对外的展示上限：发布后只公开展示这么多天，过期后前台首页、瞬间页、点赞与评论都按「不存在」处理，
        后台仍保留全部内容、评论与点赞。这是所有可见范围组的天花板——分组只能更短，不能更长。
      </p>

      <div className="admin-field">
        <span>全局可见期</span>
        <span className="admin-muted">当前生效：{data.currentLabel}</span>
        <div className="admin-chip-row" role="radiogroup" aria-label="全局可见期">
          <label className={mode === "unlimited" ? "admin-chip is-on" : "admin-chip"}>
            <input
              checked={mode === "unlimited"}
              name="momentVisibilityMode"
              onChange={() => {
                setMode("unlimited");
                void save(MOMENT_VISIBILITY_UNLIMITED);
              }}
              type="radio"
            />
            永久公开
          </label>
          <label className={mode === "preset" ? "admin-chip is-on" : "admin-chip"}>
            <input
              checked={mode === "preset"}
              name="momentVisibilityMode"
              onChange={() => {
                setMode("preset");
                void save(preset);
              }}
              type="radio"
            />
            按天数
          </label>
          <label className={mode === "custom" ? "admin-chip is-on" : "admin-chip"}>
            <input
              checked={mode === "custom"}
              name="momentVisibilityMode"
              onChange={() => setMode("custom")}
              type="radio"
            />
            自定义天数
          </label>
        </div>

        {mode === "preset" ? (
          <div className="admin-chip-row" role="radiogroup" aria-label="常用天数">
            {PRESET_DAYS.map((value) => (
              <label
                className={preset === value ? "admin-chip is-on" : "admin-chip"}
                key={value}
              >
                <input
                  checked={preset === value}
                  name="momentVisibilityPreset"
                  onChange={() => {
                    setPreset(value);
                    void save(value);
                  }}
                  type="radio"
                />
                {momentVisibilityDaysLabel(value)}
              </label>
            ))}
          </div>
        ) : null}

        {mode === "custom" ? (
          <div className="moment-visibility__custom">
            <input
              max={data.maxDays}
              min={data.minDays}
              onChange={(event) => setCustom(event.target.value)}
              step={1}
              type="number"
              value={custom}
            />
            <span className="admin-muted">
              天（{data.minDays}–{data.maxDays}）
            </span>
            <button
              className="admin-btn admin-btn--sm"
              disabled={saving || !customValid || !dirty}
              onClick={() => void save(customDays)}
              type="button"
            >
              {saving ? "保存中…" : "应用"}
            </button>
          </div>
        ) : null}

        <p className="admin-field__hint">
          {unlimited
            ? "永久公开：瞬间发布后一直对外可见，只有手动删除或改设置才会消失。"
            : `发布满 ${days} 天（${momentVisibilityDaysLabel(days)}）的瞬间不再对外展示；此刻起算，只有发布在 ${preview} 之后的瞬间可见。`}
        </p>
      </div>

      {statusLine(notice, saving, mode === "custom" && !customValid)}
      {error ? (
        <p className="admin-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function statusLine(notice: string, saving: boolean, customInvalid: boolean) {
  if (saving) {
    return <p className="admin-muted">保存中…</p>;
  }
  if (customInvalid) {
    return <p className="admin-muted">自定义天数需为 1–3650 的整数，填好后点「应用」</p>;
  }
  return notice ? <p className="admin-muted">{notice}</p> : null;
}

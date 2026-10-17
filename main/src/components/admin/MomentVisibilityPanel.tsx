"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

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

type SettingsPayload = {
  data?: { momentVisibleDays?: number };
  momentVisibleDays?: number;
};

/**
 * 全局可见期：改哪个档位就立刻保存（抽屉里没有"保存"按钮的位置，
 * 也符合"点一下立刻生效"的预期），保存结果显示在下方一行小字里。
 *
 * 三条实现约束（2026-10 修「点一下没保存 / 过一会儿才生效」时定下来的）：
 * 1. **保存判定只跟"服务端已确认值"比**（`confirmed`）。以前拿 `props.initialDays` 比，
 *    而那个值要等 `router.refresh()` 回来才变 —— 在那之前再点一下别的档位，
 *    `next === savedDays` 会**静默 return**，这一次点击根本没发请求。
 * 2. **保存串行 + 合并**：正在写的时候新的点击只更新"待写值"，写完了再写最后那一个。
 *    并发 PUT 的到达顺序不保证，最后一个点击可能被前一个请求覆盖。
 * 3. **成功即更新本地显示**，不等 `router.refresh()`（刷整页要跑一次服务端渲染，
 *    就是用户感觉到的"过一段时间才有效果"）。refresh 仍然发，只是不再挡着显示。
 */
export function MomentVisibilityPanel({ data }: { data: MomentVisibilityPanelData }) {
  const router = useRouter();
  const serverDays = normalizeVisibilityDays(data.initialDays);
  const [mode, setMode] = useState<Mode>(() => modeOf(serverDays));
  const [preset, setPreset] = useState(() =>
    modeOf(serverDays) === "preset" ? serverDays : 7,
  );
  const [custom, setCustom] = useState(() =>
    modeOf(serverDays) === "custom" ? String(serverDays) : "45",
  );
  const [confirmed, setConfirmed] = useState(serverDays);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  /** 待写的目标值（串行队列里只有最后一个有意义）；null = 没有待写 */
  const queuedRef = useRef<number | null>(null);
  const inflightRef = useRef(false);

  // 服务端数据回来了（router.refresh 之后）：没有待写/在写的目标时才跟随服务端，
  // 否则会把用户刚点的那一下覆盖回旧值
  useEffect(() => {
    if (inflightRef.current || queuedRef.current !== null) {
      return;
    }
    setConfirmed(serverDays);
  }, [serverDays]);

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
    return customValid ? customDays : confirmed;
  }, [confirmed, customDays, customValid, mode, preset]);

  const dirty = days !== confirmed;
  const unlimited = days === MOMENT_VISIBILITY_UNLIMITED;
  const preview = data.previewLabels[String(days)] ?? "";
  const currentLabel = momentVisibilityDaysLabel(confirmed);

  function enqueue(next: number) {
    const target = normalizeVisibilityDays(next);
    if (
      target === confirmed &&
      queuedRef.current === null &&
      !inflightRef.current
    ) {
      return;
    }
    setError("");
    setNotice("");
    queuedRef.current = target;
    void pump();
  }

  async function pump() {
    if (inflightRef.current) {
      // 正在写：等它结束后 finally 里会再调用一次 pump
      return;
    }
    const target = queuedRef.current;
    if (target === null) {
      return;
    }
    queuedRef.current = null;
    inflightRef.current = true;
    setSaving(true);
    try {
      const payload = await adminJson<SettingsPayload>("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({ momentVisibleDays: target }),
      });
      const saved = normalizeVisibilityDays(
        payload.data?.momentVisibleDays ?? payload.momentVisibleDays ?? target,
      );
      setConfirmed(saved);
      if (queuedRef.current === null) {
        setNotice(`已保存：${momentVisibilityDaysLabel(saved)}，前台立即生效`);
        router.refresh();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      inflightRef.current = false;
      setSaving(queuedRef.current !== null);
      if (queuedRef.current !== null) {
        void pump();
      }
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
        <span className="admin-muted">当前生效：{currentLabel}</span>
        <div className="admin-chip-row" role="radiogroup" aria-label="全局可见期">
          <label className={mode === "unlimited" ? "admin-chip is-on" : "admin-chip"}>
            <input
              checked={mode === "unlimited"}
              name="momentVisibilityMode"
              onChange={() => {
                setMode("unlimited");
                enqueue(MOMENT_VISIBILITY_UNLIMITED);
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
                enqueue(preset);
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
                    enqueue(value);
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
              onClick={() => enqueue(customDays)}
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

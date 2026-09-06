"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { adminJson } from "@/lib/client/admin";
import {
  builtinDefinition,
  defaultSizeFor,
  type BuiltinField,
} from "@/lib/home/builtins";
import { areaStyle } from "@/lib/home/grid";
import {
  applyDropToEntries,
  HOME_GRID_COLUMNS,
  isBuiltinModuleKey,
  resolveDropPlacement,
  samePlacement,
  toAreas,
  type DropTarget,
  type HomeModuleConfig,
  type HomeModuleKind,
  type PlacementBox,
} from "@/lib/home/types";
import { mergeBox, normalizeBox, pickBox } from "@/lib/layout/box";
import {
  bannerPresetToHPct,
  hPctToBannerPreset,
  type LayoutViewportId,
} from "@/lib/layout/viewport";
import { cn } from "@/lib/utils/cn";

export type LayoutEntry = {
  moduleId: number;
  name: string;
  slug: string;
  kind: HomeModuleKind;
  builtinKey: string | null;
  system: boolean;
  enabled: boolean;
  col: number;
  colSpan: number;
  row: number;
  hPct: number;
  mobileCol: number;
  mobileColSpan: number;
  mobileRow: number;
  mobileHPct: number;
  sort: number;
  config: HomeModuleConfig;
};

export type HomeAppearance = {
  homeModuleOpacity: number;
  homeBackdropOpacity: number;
};

type MoveDrag = {
  mode: "move";
  moduleId: number;
  origin: PlacementBox;
  grabX: number;
  grabY: number;
  width: number;
  height: number;
};

type DragState =
  | MoveDrag
  | { mode: "resize"; areaKey: string; startX: number; startSpan: number }
  | {
      mode: "resize-h";
      moduleId: number;
      startY: number;
      startHPct: number;
    };

const ZOOM_STEPS = [1, 0.75, 0.5] as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function areaIdentity(moduleIds: number[]) {
  return [...moduleIds].sort((a, b) => a - b).join(":");
}

export function HomeLayoutEditor({
  initial,
  previews,
  appearance,
}: {
  initial: LayoutEntry[];
  previews: Record<number, ReactNode>;
  appearance: HomeAppearance;
}) {
  const router = useRouter();
  const canvasRef = useRef<HTMLDivElement>(null);
  const deviceRef = useRef<HTMLDivElement>(null);
  const rulerRefs = useRef<Array<HTMLDivElement | null>>([]);
  const dragRef = useRef<DragState | null>(null);
  const flipRects = useRef<Map<string, DOMRect>>(new Map());

  const [viewport, setViewport] = useState<LayoutViewportId>("desktop");
  const [entries, setEntries] = useState(initial);
  const [selectedId, setSelectedId] = useState<number | null>(
    initial.find((entry) => entry.enabled)?.moduleId ?? null,
  );
  const [zoom, setZoom] = useState<number>(1);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropPreview, setDropPreview] = useState<PlacementBox | null>(null);
  const [floatPos, setFloatPos] = useState<{ x: number; y: number } | null>(null);
  const [look, setLook] = useState(appearance);
  const [lookDirty, setLookDirty] = useState(false);
  const [dragBox, setDragBox] = useState<{ width: number; height: number } | null>(
    null,
  );

  const enabled = useMemo(
    () => entries.filter((entry) => entry.enabled),
    [entries],
  );
  const boxedEnabled = useMemo(
    () =>
      enabled.map((entry) => ({
        ...entry,
        ...pickBox(entry, viewport),
      })),
    [enabled, viewport],
  );
  const displayEntries = useMemo(() => {
    if (!dragging || !dropPreview) {
      return boxedEnabled;
    }
    return applyDropToEntries(boxedEnabled, dragging, dropPreview);
  }, [boxedEnabled, dragging, dropPreview]);
  const areas = useMemo(() => toAreas(displayEntries), [displayEntries]);
  const committedMaxRow =
    boxedEnabled.length === 0
      ? 0
      : Math.max(...boxedEnabled.map((entry) => entry.row));
  const maxRow = areas.length === 0 ? 0 : Math.max(...areas.map((area) => area.row));
  const selected = entries.find((entry) => entry.moduleId === selectedId) ?? null;
  const selectedBox = selected ? pickBox(selected, viewport) : null;
  const definition = builtinDefinition(
    (selected?.builtinKey ?? null) as Parameters<typeof builtinDefinition>[0],
  );
  const draggedEntry = dragging
    ? entries.find((entry) => entry.moduleId === dragging) ?? null
    : null;

  const patchEntry = useCallback(
    (moduleId: number, patch: Partial<LayoutEntry>) => {
      setEntries((current) =>
        current.map((entry) =>
          entry.moduleId === moduleId ? { ...entry, ...patch } : entry,
        ),
      );
      setDirty(true);
    },
    [],
  );

  /** 用隐藏的 12 条标尺读真实列边界，避免在 JS 里重算 CSS 轨道宽度。 */
  const columnFromX = useCallback((clientX: number) => {
    const rulers = rulerRefs.current;
    for (let index = 0; index < rulers.length; index += 1) {
      const rect = rulers[index]?.getBoundingClientRect();
      if (rect && clientX < rect.right) {
        return index + 1;
      }
    }
    return HOME_GRID_COLUMNS;
  }, []);

  const dropTarget = useCallback(
    (clientX: number, clientY: number): DropTarget | null => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return null;
      }

      const measure = (key: string) => {
        const node = canvas.querySelector<HTMLElement>(
          `[data-area-key="${key}"]`,
        );
        return node?.getBoundingClientRect();
      };

      const isGhostArea = (area: (typeof areas)[number]) =>
        Boolean(dragging) &&
        area.items.length === 1 &&
        area.items[0].moduleId === dragging;

      const others = areas.filter((area) => !isGhostArea(area));
      const hoveredOther = others.find((area) => {
        const rect = measure(area.key);
        return Boolean(rect && clientY >= rect.top && clientY <= rect.bottom);
      });

      if (hoveredOther) {
        const rect = measure(hoveredOther.key);
        const inside = rect && clientX >= rect.left && clientX <= rect.right;
        if (inside && viewport === "desktop") {
          return {
            row: hoveredOther.row,
            col: hoveredOther.col,
            colSpan: hoveredOther.colSpan,
            adopt: true,
          };
        }
        return { row: hoveredOther.row, col: columnFromX(clientX), adopt: false };
      }

      const ghost = areas.find(isGhostArea);
      const ghostRect = ghost ? measure(ghost.key) : null;
      if (ghost && ghostRect && clientY >= ghostRect.top && clientY <= ghostRect.bottom) {
        const inside = clientX >= ghostRect.left && clientX <= ghostRect.right;
        if (inside) {
          return {
            row: ghost.row,
            col: ghost.col,
            colSpan: ghost.colSpan,
            adopt: false,
          };
        }
        return { row: ghost.row, col: columnFromX(clientX), adopt: false };
      }

      const tops = areas
        .map((area) => measure(area.key)?.top)
        .filter((value): value is number => typeof value === "number");
      if (tops.length > 0 && clientY < Math.min(...tops)) {
        return { row: 1, col: columnFromX(clientX), adopt: false };
      }

      return { row: maxRow + 1, col: columnFromX(clientX), adopt: false };
    },
    [areas, columnFromX, dragging, maxRow, viewport],
  );

  useLayoutEffect(() => {
    const root = canvasRef.current;
    if (!root) {
      return;
    }
    const nodes = root.querySelectorAll<HTMLElement>("[data-flip-id]");
    const next = new Map<string, DOMRect>();
    nodes.forEach((node) => {
      const id = node.dataset.flipId;
      if (!id) {
        return;
      }
      const rect = node.getBoundingClientRect();
      next.set(id, rect);
      const prev = flipRects.current.get(id);
      if (!prev || !dragging) {
        return;
      }
      const dx = prev.left - rect.left;
      const dy = prev.top - rect.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
        return;
      }
      node.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
        { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
    });
    flipRects.current = next;
  }, [areas, dragging]);

  function onMovePointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
    moduleId: number,
  ) {
    event.preventDefault();
    const entry = entries.find((item) => item.moduleId === moduleId);
    const moduleNode = event.currentTarget.closest(".home-editor__module");
    const rect = moduleNode?.getBoundingClientRect();
    if (!entry) {
      return;
    }
    canvasRef.current?.setPointerCapture(event.pointerId);
    const origin = pickBox(entry, viewport);
    const width = rect?.width ?? 240;
    const height = rect?.height ?? 120;
    dragRef.current = {
      mode: "move",
      moduleId,
      origin,
      grabX: event.clientX - (rect?.left ?? event.clientX),
      grabY: event.clientY - (rect?.top ?? event.clientY),
      width,
      height,
    };
    setDragBox({ width, height });
    setDropPreview(origin);
    setFloatPos({
      x: rect?.left ?? event.clientX,
      y: rect?.top ?? event.clientY,
    });
    setDragging(moduleId);
    setSelectedId(moduleId);
  }

  function onResizePointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
    areaKeyValue: string,
    startSpan: number,
  ) {
    event.preventDefault();
    canvasRef.current?.setPointerCapture(event.pointerId);
    dragRef.current = {
      mode: "resize",
      areaKey: areaKeyValue,
      startX: event.clientX,
      startSpan,
    };
  }

  function onResizeHeightPointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
    moduleId: number,
    startHPct: number,
  ) {
    event.preventDefault();
    canvasRef.current?.setPointerCapture(event.pointerId);
    dragRef.current = {
      mode: "resize-h",
      moduleId,
      startY: event.clientY,
      startHPct,
    };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }

    if (drag.mode === "resize") {
      const area = areas.find((item) => item.key === drag.areaKey);
      if (!area) {
        return;
      }
      const firstRuler = rulerRefs.current[0]?.getBoundingClientRect();
      const lastRuler = rulerRefs.current[HOME_GRID_COLUMNS - 1]?.getBoundingClientRect();
      if (!firstRuler || !lastRuler) {
        return;
      }
      const trackWidth = (lastRuler.right - firstRuler.left) / HOME_GRID_COLUMNS;
      const delta = Math.round((event.clientX - drag.startX) / trackWidth);
      const nextSpan = clamp(
        drag.startSpan + delta,
        1,
        HOME_GRID_COLUMNS - area.col + 1,
      );
      if (nextSpan === area.colSpan) {
        return;
      }
      setEntries((current) =>
        current.map((entry) => {
          if (!entry.enabled) {
            return entry;
          }
          const box = pickBox(entry, viewport);
          if (
            box.row !== area.row ||
            box.col !== area.col ||
            box.colSpan !== area.colSpan
          ) {
            return entry;
          }
          return {
            ...entry,
            ...mergeBox(viewport, { ...box, colSpan: nextSpan }),
          };
        }),
      );
      setDirty(true);
      return;
    }

    if (drag.mode === "resize-h") {
      const frame = deviceRef.current?.clientHeight || 900;
      const nextH = clamp(
        Math.round(drag.startHPct + (event.clientY - drag.startY) / (frame / 100)),
        0,
        100,
      );
      const entry = entries.find((item) => item.moduleId === drag.moduleId);
      if (!entry) {
        return;
      }
      const box = pickBox(entry, viewport);
      if (box.hPct === nextH) {
        return;
      }
      const patch: Partial<LayoutEntry> = mergeBox(viewport, {
        ...box,
        hPct: nextH,
      });
      if (entry.builtinKey === "banner") {
        patch.config = {
          ...entry.config,
          height: hPctToBannerPreset(nextH),
        };
      }
      patchEntry(drag.moduleId, patch);
      return;
    }

    setFloatPos({
      x: event.clientX - drag.grabX,
      y: event.clientY - drag.grabY,
    });
    const entry = entries.find((item) => item.moduleId === drag.moduleId);
    const target = dropTarget(event.clientX, event.clientY);
    if (!entry || !target) {
      return;
    }
    const next = resolveDropPlacement(pickBox(entry, viewport), target);
    setDropPreview((current) =>
      current && samePlacement(current, next) ? current : next,
    );
  }

  function finishMove() {
    const drag = dragRef.current;
    const preview = dropPreview;
    dragRef.current = null;
    setDragging(null);
    setFloatPos(null);
    setDropPreview(null);
    setDragBox(null);
    if (!drag || drag.mode !== "move" || !preview) {
      return;
    }
    if (samePlacement(drag.origin, preview)) {
      return;
    }
    patchEntry(drag.moduleId, mergeBox(viewport, preview));
  }

  function onPointerUp() {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    if (drag.mode === "resize" || drag.mode === "resize-h") {
      dragRef.current = null;
      return;
    }
    finishMove();
  }

  function moveWithinStack(moduleId: number, direction: -1 | 1) {
    const entry = entries.find((item) => item.moduleId === moduleId);
    if (!entry) {
      return;
    }
    const box = pickBox(entry, viewport);
    const siblings = boxedEnabled
      .filter(
        (item) =>
          item.row === box.row &&
          item.col === box.col &&
          item.colSpan === box.colSpan,
      )
      .sort((a, b) => a.sort - b.sort || a.moduleId - b.moduleId);
    const index = siblings.findIndex((item) => item.moduleId === moduleId);
    const swap = siblings[index + direction];
    if (!swap) {
      return;
    }
    setEntries((current) =>
      current.map((item) => {
        if (item.moduleId === entry.moduleId) {
          return { ...item, sort: swap.sort };
        }
        if (item.moduleId === swap.moduleId) {
          return { ...item, sort: entry.sort };
        }
        return item;
      }),
    );
    setDirty(true);
  }

  async function saveLayout() {
    setError("");
    setSaving(true);
    try {
      await adminJson("/api/admin/home/layout", {
        method: "PUT",
        body: JSON.stringify({
          items: entries.map((entry) => ({
            moduleId: entry.moduleId,
            enabled: entry.enabled,
            col: entry.col,
            colSpan: entry.colSpan,
            row: entry.row,
            hPct: entry.hPct,
            mobileCol: entry.mobileCol,
            mobileColSpan: entry.mobileColSpan,
            mobileRow: entry.mobileRow,
            mobileHPct: entry.mobileHPct,
          })),
        }),
      });
      setDirty(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存布局失败");
    } finally {
      setSaving(false);
    }
  }

  async function saveConfig() {
    if (!selected) {
      return;
    }
    setError("");
    setSaving(true);
    try {
      await adminJson(`/api/admin/modules/${selected.moduleId}`, {
        method: "PATCH",
        body: JSON.stringify({ config: selected.config }),
      });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存模块配置失败");
    } finally {
      setSaving(false);
    }
  }

  async function saveAppearance() {
    setError("");
    setSaving(true);
    try {
      await adminJson("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({
          homeModuleOpacity: look.homeModuleOpacity,
          homeBackdropOpacity: look.homeBackdropOpacity,
        }),
      });
      setLookDirty(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存外观失败");
    } finally {
      setSaving(false);
    }
  }

  function updateConfig(patch: HomeModuleConfig) {
    if (!selected) {
      return;
    }
    const heightPatch =
      patch.height && selected.builtinKey === "banner"
        ? mergeBox(viewport, {
            ...pickBox(selected, viewport),
            hPct: bannerPresetToHPct(patch.height),
          })
        : {};
    setEntries((current) =>
      current.map((entry) =>
        entry.moduleId === selected.moduleId
          ? {
              ...entry,
              ...heightPatch,
              config: { ...entry.config, ...patch },
            }
          : entry,
      ),
    );
    if (patch.height) {
      setDirty(true);
    }
  }

  function resetSelectedSize() {
    if (!selected || !selected.enabled || !selectedBox) {
      return;
    }
    const size = defaultSizeFor(
      isBuiltinModuleKey(selected.builtinKey) ? selected.builtinKey : null,
      viewport,
    );
    const next = normalizeBox({
      ...selectedBox,
      colSpan: size.colSpan,
      hPct: size.hPct,
    });
    const patch: Partial<LayoutEntry> = mergeBox(viewport, next);
    if (selected.builtinKey === "banner") {
      patch.config = {
        ...selected.config,
        height: hPctToBannerPreset(size.hPct),
      };
    }
    patchEntry(selected.moduleId, patch);
  }

  const canvasVars = {
    "--home-module-fill": `${look.homeModuleOpacity}%`,
    "--home-backdrop-opacity": look.homeBackdropOpacity / 100,
    zoom,
  } as CSSProperties;

  return (
    <div className="home-editor">
      <aside className="home-editor__rail">
        <div className="home-editor__rail-body">
          <section className="home-editor__group">
            <h2>外观</h2>
            <p className="admin-muted">
              统一调整首页模块玻璃底与背景图的不透明度，前台立刻生效。
            </p>
            <label className="form-field">
              模块不透明度（{look.homeModuleOpacity}%）
              <input
                max={100}
                min={0}
                onChange={(event) => {
                  setLook((current) => ({
                    ...current,
                    homeModuleOpacity: Number(event.target.value),
                  }));
                  setLookDirty(true);
                }}
                type="range"
                value={look.homeModuleOpacity}
              />
            </label>
            <label className="form-field">
              背景不透明度（{look.homeBackdropOpacity}%）
              <input
                max={100}
                min={0}
                onChange={(event) => {
                  setLook((current) => ({
                    ...current,
                    homeBackdropOpacity: Number(event.target.value),
                  }));
                  setLookDirty(true);
                }}
                type="range"
                value={look.homeBackdropOpacity}
              />
            </label>
            <button
              className="heo-button"
              disabled={saving || !lookDirty}
              onClick={() => void saveAppearance()}
              type="button"
            >
              {lookDirty ? "保存外观" : "外观已保存"}
            </button>
          </section>

          <section className="home-editor__group">
            <h2>模块</h2>
            <p className="admin-muted">
              勾选放入首页，点名字在下方改配置。自建模块在{" "}
              <Link href="/admin/modules">模块管理</Link> 里创建。
            </p>
            <ul className="home-editor__list">
              {entries.map((entry) => (
                <li key={entry.moduleId}>
                  <label className="home-editor__check">
                    <input
                      checked={entry.enabled}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        if (!checked) {
                          patchEntry(entry.moduleId, { enabled: false });
                          return;
                        }
                        const box = pickBox(entry, viewport);
                        patchEntry(entry.moduleId, {
                          enabled: true,
                          ...mergeBox(viewport, {
                            ...box,
                            row: committedMaxRow + 1,
                          }),
                        });
                      }}
                      type="checkbox"
                    />
                    <span className="visually-hidden">
                      {entry.enabled ? "移出首页" : "放入首页"}
                    </span>
                  </label>
                  <button
                    className={cn(
                      "home-editor__pick",
                      selectedId === entry.moduleId && "is-active",
                    )}
                    onClick={() => setSelectedId(entry.moduleId)}
                    type="button"
                  >
                    <span>{entry.name}</span>
                    <span className="home-editor__tag">
                      {entry.kind === "custom" ? "自建" : "内置"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {selected ? (
            <section className="home-editor__group">
              <h2>{selected.name}</h2>
              {definition ? (
                <p className="admin-muted">{definition.hint}</p>
              ) : (
                <p className="admin-muted">
                  自建模块。积木与代码在{" "}
                  <Link href={`/admin/modules/${selected.moduleId}`}>
                    模块管理
                  </Link>{" "}
                  里编辑。
                </p>
              )}

              {selected.enabled && selectedBox ? (
                <div className="home-editor__grid-fields">
                  <label className="form-field">
                    行
                    <input
                      max={committedMaxRow + 1}
                      min={1}
                      onChange={(event) =>
                        patchEntry(
                          selected.moduleId,
                          mergeBox(viewport, {
                            ...selectedBox,
                            row: clamp(
                              Number(event.target.value),
                              1,
                              committedMaxRow + 1,
                            ),
                          }),
                        )
                      }
                      type="number"
                      value={selectedBox.row}
                    />
                  </label>
                  <label className="form-field">
                    起始列
                    <input
                      max={HOME_GRID_COLUMNS - selectedBox.colSpan + 1}
                      min={1}
                      onChange={(event) =>
                        patchEntry(
                          selected.moduleId,
                          mergeBox(viewport, {
                            ...selectedBox,
                            col: clamp(
                              Number(event.target.value),
                              1,
                              HOME_GRID_COLUMNS - selectedBox.colSpan + 1,
                            ),
                          }),
                        )
                      }
                      type="number"
                      value={selectedBox.col}
                    />
                  </label>
                  <label className="form-field">
                    宽度（列）
                    <input
                      max={HOME_GRID_COLUMNS - selectedBox.col + 1}
                      min={1}
                      onChange={(event) =>
                        patchEntry(
                          selected.moduleId,
                          mergeBox(viewport, {
                            ...selectedBox,
                            colSpan: clamp(
                              Number(event.target.value),
                              1,
                              HOME_GRID_COLUMNS - selectedBox.col + 1,
                            ),
                          }),
                        )
                      }
                      type="number"
                      value={selectedBox.colSpan}
                    />
                  </label>
                  <label className="form-field">
                    高度（% 视口，0=随内容）
                    <input
                      max={100}
                      min={0}
                      onChange={(event) => {
                        const hPct = clamp(Number(event.target.value), 0, 100);
                        const patch: Partial<LayoutEntry> = mergeBox(viewport, {
                          ...selectedBox,
                          hPct,
                        });
                        if (selected.builtinKey === "banner") {
                          patch.config = {
                            ...selected.config,
                            height: hPctToBannerPreset(hPct),
                          };
                        }
                        patchEntry(selected.moduleId, patch);
                      }}
                      type="number"
                      value={selectedBox.hPct}
                    />
                  </label>
                  {viewport === "desktop" ? (
                    <div className="home-editor__stack-order">
                      <span>同格顺序</span>
                      <button
                        onClick={() => moveWithinStack(selected.moduleId, -1)}
                        type="button"
                      >
                        上移
                      </button>
                      <button
                        onClick={() => moveWithinStack(selected.moduleId, 1)}
                        type="button"
                      >
                        下移
                      </button>
                    </div>
                  ) : null}
                  <button
                    className="heo-button"
                    onClick={resetSelectedSize}
                    type="button"
                  >
                    重置大小
                  </button>
                </div>
              ) : (
                <p className="admin-muted">未放入首页，勾选后可设置位置。</p>
              )}

              {definition && definition.fields.length > 0 ? (
                <div className="home-editor__config">
                  {definition.fields.map((field) => (
                    <ConfigField
                      config={selected.config}
                      field={field}
                      key={String(field.name)}
                      onChange={updateConfig}
                    />
                  ))}
                  <button
                    className="heo-button"
                    disabled={saving}
                    onClick={() => void saveConfig()}
                    type="button"
                  >
                    保存模块配置
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>

        <div className="home-editor__rail-foot">
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            className="heo-button"
            disabled={saving || !dirty}
            onClick={() => void saveLayout()}
            type="button"
          >
            {saving ? "保存中…" : dirty ? "保存布局" : "布局已保存"}
          </button>
        </div>
      </aside>

      <div className="home-editor__canvas-pane">
        <header className="home-editor__toolbar">
          <span>
            {viewport === "mobile" ? "手机画框" : "电脑画框"}（真实数据预览）
          </span>
          <div className="home-editor__toolbar-tools">
            <div className="home-editor__vp">
              <button
                className={cn(viewport === "desktop" && "is-active")}
                onClick={() => setViewport("desktop")}
                type="button"
              >
                电脑
              </button>
              <button
                className={cn(viewport === "mobile" && "is-active")}
                onClick={() => setViewport("mobile")}
                type="button"
              >
                手机
              </button>
            </div>
            <div className="home-editor__zoom">
              {ZOOM_STEPS.map((step) => (
                <button
                  className={cn(zoom === step && "is-active")}
                  key={step}
                  onClick={() => setZoom(step)}
                  type="button"
                >
                  {Math.round(step * 100)}%
                </button>
              ))}
            </div>
          </div>
        </header>
        <div
          className={cn(
            "home-editor__canvas",
            dragging !== null && "is-dragging",
          )}
          onPointerCancel={onPointerUp}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          ref={canvasRef}
          style={canvasVars}
        >
          <div
            className={cn(
              "home-editor__device",
              viewport === "mobile" && "is-phone",
            )}
            ref={deviceRef}
          >
          <div className="home-grid home-grid--canvas" data-vp={viewport}>
            {Array.from({ length: HOME_GRID_COLUMNS }, (_, index) => (
              <div
                aria-hidden="true"
                className="home-grid__ruler"
                key={index}
                ref={(node) => {
                  rulerRefs.current[index] = node;
                }}
                style={
                  {
                    "--cell-col":
                      viewport === "mobile" ? index + 1 : index + 2,
                    "--cell-col-span": 1,
                    "--cell-row": 1,
                  } as CSSProperties
                }
              />
            ))}

            {areas.map((area) => {
              const dropHere = Boolean(
                dropPreview &&
                  area.row === dropPreview.row &&
                  area.col === dropPreview.col &&
                  area.colSpan === dropPreview.colSpan,
              );
              return (
                <div
                  className={cn(
                    "home-grid__area home-editor__area",
                    dropHere && "is-drop-target",
                  )}
                  data-area-key={area.key}
                  key={areaIdentity(area.items.map((item) => item.moduleId))}
                  style={areaStyle(area, { gutter: viewport !== "mobile" })}
                >
                  {area.items.map((item) =>
                    dragging === item.moduleId ? (
                      <div
                        aria-hidden="true"
                        className="home-editor__ghost"
                        key={item.moduleId}
                        style={{ minHeight: dragBox?.height ?? 120 }}
                      />
                    ) : (
                      <div
                        className={cn(
                          "home-editor__module",
                          selectedId === item.moduleId && "is-selected",
                          item.hPct > 0 && "is-fixed",
                        )}
                        data-flip-id={String(item.moduleId)}
                        key={item.moduleId}
                        onClick={() => setSelectedId(item.moduleId)}
                        style={
                          {
                            "--cell-h": item.hPct,
                          } as CSSProperties
                        }
                      >
                        <div className="home-editor__module-bar">
                          <button
                            className="home-editor__handle"
                            onPointerDown={(event) =>
                              onMovePointerDown(event, item.moduleId)
                            }
                            title="拖动到目标格子"
                            type="button"
                          >
                            <span aria-hidden="true">⣿</span>
                            <span>{item.name}</span>
                          </button>
                          <span className="home-editor__coords">
                            {area.row} 行 · {area.col}–{area.col + area.colSpan - 1}{" "}
                            列
                          </span>
                        </div>
                        <div className="home-editor__preview">
                          {previews[item.moduleId] ?? (
                            <p className="admin-muted">
                              该模块当前没有可渲染内容。
                            </p>
                          )}
                        </div>
                        <button
                          className="home-editor__resize is-height"
                          onPointerDown={(event) =>
                            onResizeHeightPointerDown(
                              event,
                              item.moduleId,
                              item.hPct,
                            )
                          }
                          title="拖动改变高度"
                          type="button"
                        >
                          <span className="visually-hidden">调整高度</span>
                        </button>
                      </div>
                    ),
                  )}
                  <button
                    className="home-editor__resize"
                    onPointerDown={(event) =>
                      onResizePointerDown(event, area.key, area.colSpan)
                    }
                    title="拖动改变宽度"
                    type="button"
                  >
                    <span className="visually-hidden">调整宽度</span>
                  </button>
                </div>
              );
            })}
          </div>
          </div>
          {areas.length === 0 ? (
            <p className="admin-muted">左侧勾选模块后会出现在这里。</p>
          ) : null}
        </div>
        {dragging && floatPos && draggedEntry && dragBox ? (
          <div
            className="home-editor__float"
            style={{
              left: floatPos.x,
              top: floatPos.y,
              width: dragBox.width,
              height: dragBox.height,
            }}
          >
            <div className="home-editor__module is-float">
              <div className="home-editor__module-bar">
                <span className="home-editor__handle">
                  <span aria-hidden="true">⣿</span>
                  <span>{draggedEntry.name}</span>
                </span>
              </div>
              <div className="home-editor__preview">
                {previews[dragging] ?? (
                  <p className="admin-muted">该模块当前没有可渲染内容。</p>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ConfigField({
  field,
  config,
  onChange,
}: {
  field: BuiltinField;
  config: HomeModuleConfig;
  onChange: (patch: HomeModuleConfig) => void;
}) {
  const value = config[field.name];

  switch (field.kind) {
    case "toggle":
      return (
        <label className="home-editor__toggle">
          <input
            checked={value !== false}
            onChange={(event) => onChange({ [field.name]: event.target.checked })}
            type="checkbox"
          />
          {field.label}
        </label>
      );
    case "number":
      return (
        <label className="form-field">
          {field.label}
          <input
            max={field.max}
            min={field.min}
            onChange={(event) =>
              onChange({
                [field.name]: clamp(
                  Number(event.target.value),
                  field.min,
                  field.max,
                ),
              })
            }
            type="number"
            value={typeof value === "number" ? value : field.min}
          />
        </label>
      );
    case "select":
      return (
        <label className="form-field">
          {field.label}
          <select
            onChange={(event) => onChange({ [field.name]: event.target.value })}
            value={typeof value === "string" ? value : field.options[0].value}
          >
            {field.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      );
    case "textarea":
      return (
        <label className="form-field">
          {field.label}
          <textarea
            onChange={(event) => onChange({ [field.name]: event.target.value })}
            rows={field.rows ?? 3}
            value={typeof value === "string" ? value : ""}
          />
        </label>
      );
    case "lines": {
      const max = field.max ?? 3;
      return (
        <label className="form-field">
          {field.label}
          <textarea
            onChange={(event) =>
              onChange({
                [field.name]: event.target.value
                  .split("\n")
                  .map((line) =>
                    line.trim().slice(0, field.name === "chips" ? 8 : 60),
                  )
                  .filter(Boolean)
                  .slice(0, max),
              })
            }
            rows={Math.min(max, 8)}
            value={Array.isArray(value) ? value.join("\n") : ""}
          />
          {field.hint ? <span className="admin-muted">{field.hint}</span> : null}
        </label>
      );
    }
    default:
      return (
        <label className="form-field">
          {field.label}
          <input
            onChange={(event) => onChange({ [field.name]: event.target.value })}
            placeholder={field.kind === "text" ? field.placeholder : undefined}
            value={typeof value === "string" ? value : ""}
          />
        </label>
      );
  }
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { adminJson } from "@/lib/client/admin";
import { isModuleHidden } from "@/lib/client/detect";
import {
  builtinDefinition,
  defaultSizeFor,
  parseLineField,
  sanitizeLineField,
  type BuiltinField,
} from "@/lib/home/builtins";
import {
  canonicalizeBoxes,
  describeDrop,
  effectivePlacement,
  mergeColumnBelow,
  planDrop,
  resolveDropTarget,
  sameDropTarget,
  type DropMeasureCell,
  type DropModel,
  type DropTarget,
} from "@/lib/home/drop";
import { buildHomeAreas } from "@/lib/home/grid-model";
import {
  HOME_GRID_COLUMNS,
  isFloatingModule,
  type BuiltinModuleKey,
  type HomeModuleConfig,
  type HomeModuleKind,
  type HomePinMode,
  type PlacementBox,
} from "@/lib/home/types";
import { mergeBox, normalizeBox, pickBox } from "@/lib/layout/box";
import {
  clampModuleHeight,
  dragDeltaToModulePx,
  H_PCT_MAX,
  H_PCT_MIN,
  H_PCT_STEP,
  VIEWPORT_DESKTOP,
  VIEWPORT_PHONE,
  type LayoutViewportId,
} from "@/lib/layout/viewport";
import { cn } from "@/lib/utils/cn";

/**
 * 首页管理画布。
 *
 * 三件事在这一次重写里被钉死：
 *
 * 1. **预览就是前台**：画布渲染 `.home-grid[data-vp]` + `buildHomeAreas()` 的同一份模型，
 *    模块内容仍是服务端预渲染的 `HomeModuleRenderer`（`preview`）。画框是**设计视口真尺寸**
 *    （电脑 1440×900 / 手机 390×844），用 CSS `zoom` 缩放适配窗口 ——
 *    不再改 `--grid-max`、不再套内边距、不再另算高度。
 * 2. **编辑辅助不占尺寸**：名称手柄 / 选中描边 / 宽高手柄 / 落点提示都是格子内
 *    `position: absolute; inset: 0` 的 `.home-editor__chrome`（`pointer-events: none`，
 *    只有手柄本身可点），模块内容的盒子与前台逐像素一致。
 * 3. **落点只跟指针有关**：按下时冻结几何快照（设计视口坐标），拖动中预览会重排、
 *    但落点永远只用那份快照算 —— 所以不会「落点反复切换」；边缘自动滚动时内容在动、
 *    指针没动，设计坐标自然变化，落点随之更新。
 */

/** 保存前把多行列表字段收干净（编辑期间允许留空行，见 `parseLineField()`）。 */
function sanitizeConfig(module: {
  builtinKey: BuiltinModuleKey | null;
  config: HomeModuleConfig;
}): HomeModuleConfig {
  const config: HomeModuleConfig = { ...module.config };
  const definition = builtinDefinition(module.builtinKey);
  for (const field of definition?.fields ?? []) {
    if (field.kind !== "lines") {
      continue;
    }
    const value = config[field.name];
    if (Array.isArray(value)) {
      config[field.name] = sanitizeLineField(value) as never;
    }
  }
  return config;
}

export type LayoutEntry = {
  moduleId: number;
  name: string;
  slug: string;
  kind: HomeModuleKind;
  builtinKey: BuiltinModuleKey | null;
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
  homeBadgeColor: string;
  homeBadgeOpacity: number;
};

/** 服务端 PUT 回来的格点（不含 config，回写时按 moduleId 合并）。 */
type LayoutApiItem = {
  moduleId: number;
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
};

type MoveDrag = {
  mode: "move";
  moduleId: number;
  pointerId: number;
  origin: PlacementBox;
  /** 被拖模块自己的列跨度：`column` / `row` 落点保留它，只有 `stack` 才改成目标格的宽度 */
  colSpan: number;
  /** 抓手在模块内的偏移（视觉 px），浮标跟着指针走 */
  grabX: number;
  grabY: number;
};

type DragState =
  | MoveDrag
  | {
      mode: "resize";
      /** 一起改宽度的同格模块（按 id 认，不按 area key —— key 里的 colSpan 一变就找不到了） */
      members: number[];
      row: number;
      col: number;
      startX: number;
      startSpan: number;
    }
  | {
      mode: "resize-h";
      moduleId: number;
      startY: number;
      startHPct: number;
    };

const ZOOM_STEPS = [1, 0.75, 0.5] as const;

/** 指针进入画框可见区上下沿的多少像素内开始自动滚动。 */
const EDGE_PX = 64;
/** 自动滚动的每帧最大位移（视觉 px）。 */
const EDGE_MAX_STEP = 18;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * 这个模块**进不进格点流**（进 = 参与行带高度、能被拖拽排序）。
 *
 * 三个例外各有唯一判定口子，这里只是把它们合起来用一次：
 * 覆盖层模块（`isFloatingModule`）、页脚运行时间（`uptime`）、App 里不渲染的模块（预览里永远显示）。
 * 前台 `HomeGrid` 走同一套口径 —— 画布与前台「谁占格子」必须一致，否则预览里会多出/少掉一整行。
 */
function isGridSkip(entry: {
  builtinKey: BuiltinModuleKey | null;
  kind: HomeModuleKind;
  config: HomeModuleConfig;
}): boolean {
  return (
    isFloatingModule(entry) ||
    entry.builtinKey === "uptime" ||
    isModuleHidden(entry, { preview: true })
  );
}

/** 把服务端回写的格点合进本地 entries（保留 name / config 等本地字段）。 */
function mergeLayoutResponse(
  entries: LayoutEntry[],
  items: LayoutApiItem[],
): LayoutEntry[] {
  const byModule = new Map(items.map((item) => [item.moduleId, item]));
  return entries.map((entry) => {
    const next = byModule.get(entry.moduleId);
    return next ? { ...entry, ...next } : entry;
  });
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
  const chipRef = useRef<HTMLDivElement>(null);
  const rulerRefs = useRef<Array<HTMLDivElement | null>>([]);
  const dragRef = useRef<DragState | null>(null);
  const dropModelRef = useRef<DropModel | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const scrollDirRef = useRef(0);
  const rafRef = useRef(0);
  /** 自动滚动那一帧的函数本体（自续帧时经它转一手，避免 useCallback 引用自己） */
  const tickRef = useRef<() => void>(() => {});
  const flipRects = useRef<Map<string, DOMRect>>(new Map());

  const [viewport, setViewport] = useState<LayoutViewportId>("desktop");
  // 首屏就把「存的位置」收敛成「渲染的位置」（渲染结果不变，但拖拽/保存/刷新从此同一个坐标系）
  const [entries, setEntries] = useState(() => canonicalizeBoxes(initial));
  const [selectedId, setSelectedId] = useState<number | null>(
    initial.find((entry) => entry.enabled)?.moduleId ?? null,
  );
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [fitZoom, setFitZoom] = useState(1);
  const [pane, setPane] = useState<"settings" | "canvas">("canvas");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [autoScrolling, setAutoScrolling] = useState(false);
  const [look, setLook] = useState(appearance);
  const [lookDirty, setLookDirty] = useState(false);

  const design = viewport === "mobile" ? VIEWPORT_PHONE : VIEWPORT_DESKTOP;
  const designWidth = design.width;
  const designHeight = design.height;
  const zoomValue = zoom === "fit" ? fitZoom : zoom;

  const enabled = useMemo(
    () => entries.filter((entry) => entry.enabled),
    [entries],
  );

  /** 当前视口的盒子（几何计算只认它）。 */
  const boxedEnabled = useMemo(
    () => enabled.map((entry) => ({ ...entry, ...pickBox(entry, viewport) })),
    [enabled, viewport],
  );

  /** 真正进格点流的那批：行号 / 落点 / 拖拽都只在这批里算。 */
  const gridEntries = useMemo(
    () => boxedEnabled.filter((entry) => !isGridSkip(entry)),
    [boxedEnabled],
  );

  /**
   * 拖动中的预览：把落点规划的结果贴回 entries。
   *
   * 规划只吃**进格点流的启用模块** —— 覆盖层与页脚运行时间不参与行号（它们不占格），
   * 拉进来会让「第 N 行」在预览坐标系与存储坐标系里再次分叉。
   */
  const displayEntries = useMemo(() => {
    if (draggingId === null || !dropTarget) {
      return entries;
    }
    const planned = planDrop(gridEntries, draggingId, dropTarget);
    const byModule = new Map(planned.map((item) => [item.moduleId, item]));
    return entries.map((entry) => {
      const next = byModule.get(entry.moduleId);
      if (!next) {
        return entry;
      }
      const box = pickBox(entry, viewport);
      return {
        ...entry,
        ...mergeBox(viewport, { ...box, row: next.row, col: next.col, colSpan: next.colSpan }),
        // `sort` 是**两个视口共用**的一列（数据库里只有一份），所以不走 mergeBox：
        // 同格顺序只按它排，漏掉它「拖进同格第几位」在预览与落库里都会静默失效。
        sort: next.sort,
      };
    });
  }, [dropTarget, draggingId, entries, gridEntries, viewport]);

  const boxedAll = useMemo(
    () => displayEntries.map((entry) => ({ ...entry, ...pickBox(entry, viewport) })),
    [displayEntries, viewport],
  );

  /** 进格点流的模块 + 同一份布局模型（与前台 `HomeGrid` 完全一致）。 */
  const areas = useMemo(
    () =>
      buildHomeAreas(boxedAll, (entry) => ({
        moduleId: entry.moduleId,
        builtinKey: entry.builtinKey,
        bleed: Boolean(builtinDefinition(entry.builtinKey)?.bleed),
        // 覆盖层模块与页脚运行时间**不进格点流**（前台就是这么渲的），
        // 留在这里会让画布多出一整行 —— 那正是「预览 ≠ 前台」的来源之一。
        skip: !entry.enabled || isGridSkip(entry),
        row: entry.row,
        col: entry.col,
        colSpan: entry.colSpan,
        sort: entry.sort,
        hPct: entry.hPct,
        mobileHPct: entry.mobileHPct,
        mobileCol: entry.mobileCol,
        mobileColSpan: entry.mobileColSpan,
        mobileRow: entry.mobileRow,
        pin: entry.config.pin,
      })),
    [boxedAll],
  );

  const floats = useMemo(
    () => boxedAll.filter((entry) => entry.enabled && isFloatingModule(entry)),
    [boxedAll],
  );
  const uptime = useMemo(
    () =>
      boxedAll.find((entry) => entry.enabled && entry.builtinKey === "uptime") ??
      null,
    [boxedAll],
  );

  const committedMaxRow =
    gridEntries.length === 0
      ? 0
      : Math.max(...gridEntries.map((entry) => entry.row));
  const selected = entries.find((entry) => entry.moduleId === selectedId) ?? null;
  const selectedEntryBox = selected ? pickBox(selected, viewport) : null;
  const definition = builtinDefinition(selected?.builtinKey ?? null);

  /** 落定后这一块实际在哪（吃的是预览数据，不是落点声明）。 */
  const effective = useMemo(
    () =>
      draggingId === null
        ? null
        : effectivePlacement(
            boxedAll.filter((entry) => entry.enabled && !isGridSkip(entry)),
            draggingId,
          ),
    [boxedAll, draggingId],
  );

  const draggedEntry = draggingId
    ? entries.find((entry) => entry.moduleId === draggingId) ?? null
    : null;
  const dropText =
    draggingId !== null && dropTarget
      ? describeDrop(dropTarget, effective)
      : "";

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

  // ── 画布适配：设计视口真尺寸 + zoom 缩放 ────────────────────────────────────
  useEffect(() => {
    const paneNode = canvasRef.current;
    if (!paneNode) {
      return;
    }
    const update = () => {
      const rect = paneNode.getBoundingClientRect();
      const width = Math.max(120, rect.width - 24);
      const height = Math.max(120, rect.height - 24);
      setFitZoom(Math.min(1, width / designWidth, height / designHeight));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(paneNode);
    return () => observer.disconnect();
  }, [designHeight, designWidth]);

  /** 视觉坐标 → 设计视口坐标（相对画框内容原点，含滚动位移）。 */
  const toDesign = useCallback((clientX: number, clientY: number) => {
    const device = deviceRef.current;
    if (!device) {
      return { x: 0, y: 0 };
    }
    const rect = device.getBoundingClientRect();
    const scale = rect.width > 0 ? rect.width / designWidth : 1;
    return {
      x: (clientX - rect.left) / scale + device.scrollLeft,
      y: (clientY - rect.top) / scale + device.scrollTop,
    };
  }, [designWidth]);

  /**
   * 冻结落点几何：格子与 12 条列轨道都要换算成设计视口坐标。
   *
   * `scale` 用**画框矩形宽度 / 设计宽度**推出来，所以无论 `zoom` 把 `getBoundingClientRect()`
   * 报成缩放前还是缩放后的值，比值都一致（这也是不拿 `clientWidth` 硬算的原因）。
   */
  const measureDropModel = useCallback((): DropModel | null => {
    const device = deviceRef.current;
    if (!device) {
      return null;
    }
    const frame = device.getBoundingClientRect();
    const scale = frame.width > 0 ? frame.width / designWidth : 0;
    if (!(scale > 0)) {
      return null;
    }
    const toRect = (rect: DOMRect) => ({
      top: (rect.top - frame.top) / scale + device.scrollTop,
      bottom: (rect.bottom - frame.top) / scale + device.scrollTop,
      left: (rect.left - frame.left) / scale + device.scrollLeft,
      right: (rect.right - frame.left) / scale + device.scrollLeft,
    });

    const cells: DropMeasureCell[] = [];
    for (const node of device.querySelectorAll<HTMLElement>("[data-cell-module]")) {
      const moduleId = Number(node.dataset.cellModule);
      const [row, col, colSpan] = (node.dataset.cell ?? "").split(":").map(Number);
      const entry = entries.find((item) => item.moduleId === moduleId);
      if (!entry || !Number.isFinite(row) || !Number.isFinite(col)) {
        continue;
      }
      cells.push({
        moduleId,
        row,
        col,
        colSpan,
        sort: entry.sort,
        ...toRect(node.getBoundingClientRect()),
      });
    }

    const columns = rulerRefs.current
      .filter((node): node is HTMLDivElement => Boolean(node))
      .map((node) => toRect(node.getBoundingClientRect()));

    return {
      mode: viewport === "mobile" ? "list" : "grid",
      cells,
      columns,
    };
  }, [designWidth, entries, viewport]);

  // ── 拖动：模块移动 ────────────────────────────────────────────────────────
  function onMovePointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
    moduleId: number,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const entry = entries.find((item) => item.moduleId === moduleId);
    const model = measureDropModel();
    if (!entry || !model) {
      return;
    }
    const node = event.currentTarget.closest<HTMLElement>("[data-cell-module]");
    const rect = node?.getBoundingClientRect();
    const box = pickBox(entry, viewport);

    dragRef.current = {
      mode: "move",
      moduleId,
      pointerId: event.pointerId,
      origin: { row: box.row, col: box.col, colSpan: box.colSpan },
      colSpan: box.colSpan,
      grabX: rect ? event.clientX - rect.left : 24,
      grabY: rect ? event.clientY - rect.top : 14,
    };
    dropModelRef.current = model;
    pointerRef.current = { x: event.clientX, y: event.clientY };
    // capture 挂在**画布**上：预览会把被拖模块整个换掉，挂在手柄上会随节点一起丢（P-043）
    canvasRef.current?.setPointerCapture(event.pointerId);
    moveChip(event.clientX, event.clientY);
    setDraggingId(moduleId);
    setSelectedId(moduleId);
    setDropTarget(
      resolveDropTarget(model, toDesign(event.clientX, event.clientY), {
        moduleId,
        colSpan: box.colSpan,
      }),
    );
  }

  function moveChip(clientX: number, clientY: number) {
    const chip = chipRef.current;
    if (chip) {
      chip.style.transform = `translate3d(${Math.round(clientX + 16)}px, ${Math.round(clientY + 14)}px, 0)`;
    }
  }

  /** 用最后一次指针位置重算落点（拖动中与边缘自动滚动每帧都调）。 */
  const refreshDropTarget = useCallback(() => {
    const drag = dragRef.current;
    const model = dropModelRef.current;
    const pointer = pointerRef.current;
    if (!drag || drag.mode !== "move" || !model || !pointer) {
      return;
    }
    const next = resolveDropTarget(model, toDesign(pointer.x, pointer.y), {
      moduleId: drag.moduleId,
      colSpan: drag.colSpan,
    });
    setDropTarget((current) => (sameDropTarget(current, next) ? current : next));
  }, [toDesign]);

  // ── 边缘自动滚动 ──────────────────────────────────────────────────────────
  const stopAutoScroll = useCallback(() => {
    scrollDirRef.current = 0;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    setAutoScrolling(false);
  }, []);

  const edgeDirection = useCallback((clientY: number): -1 | 0 | 1 => {
    const device = deviceRef.current;
    if (!device) {
      return 0;
    }
    const rect = device.getBoundingClientRect();
    if (clientY < rect.top + EDGE_PX) {
      return -1;
    }
    if (clientY > rect.bottom - EDGE_PX) {
      return 1;
    }
    return 0;
  }, []);

  const tickAutoScroll = useCallback(() => {
    rafRef.current = 0;
    const device = deviceRef.current;
    const pointer = pointerRef.current;
    const direction = scrollDirRef.current;
    if (!device || !pointer || direction === 0) {
      setAutoScrolling(false);
      return;
    }
    const rect = device.getBoundingClientRect();
    const scale = rect.width > 0 ? rect.width / designWidth : 1;
    const distance =
      direction < 0 ? rect.top + EDGE_PX - pointer.y : pointer.y - (rect.bottom - EDGE_PX);
    // 距离是**视觉** px，而 `scrollTop` 是画框自己（缩放前）的 CSS px —— 要按比例还原，
    // 否则 zoom 一变滚动速度就跟着变（P-139 同一类口径混淆）。
    const step = (clamp(distance / EDGE_PX, 0.15, 1) * EDGE_MAX_STEP) / scale;
    const before = device.scrollTop;
    device.scrollTop = before + step * direction;
    const moved = device.scrollTop !== before;
    // 内容滚了、指针没动 → 设计坐标跟着变 → 落点必须重算（否则拖不到原本看不到的位置）
    if (moved) {
      refreshDropTarget();
    }
    // 自续帧：走 ref 转一手，别让 `useCallback` 里直接引用自己（会被 no-use-before-define 判错）
    rafRef.current = requestAnimationFrame(() => tickRef.current());
  }, [designWidth, refreshDropTarget]);

  useEffect(() => {
    tickRef.current = tickAutoScroll;
  }, [tickAutoScroll]);

  const startAutoScroll = useCallback(
    (clientY: number) => {
      const direction = edgeDirection(clientY);
      if (direction === scrollDirRef.current) {
        return;
      }
      scrollDirRef.current = direction;
      if (direction === 0) {
        stopAutoScroll();
        return;
      }
      setAutoScrolling(true);
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(tickAutoScroll);
      }
    },
    [edgeDirection, stopAutoScroll, tickAutoScroll],
  );

  useEffect(() => () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  // ── 拖动：宽度 / 高度 ────────────────────────────────────────────────────
  function onResizePointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
    anchor: { row: number; col: number; colSpan: number; members: number[] },
  ) {
    event.preventDefault();
    event.stopPropagation();
    canvasRef.current?.setPointerCapture(event.pointerId);
    dragRef.current = {
      mode: "resize",
      members: anchor.members,
      row: anchor.row,
      col: anchor.col,
      startX: event.clientX,
      startSpan: anchor.colSpan,
    };
  }

  function onResizeHeightPointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
    moduleId: number,
    startHPct: number,
  ) {
    event.preventDefault();
    event.stopPropagation();
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
      const first = rulerRefs.current[0]?.getBoundingClientRect();
      const last = rulerRefs.current[HOME_GRID_COLUMNS - 1]?.getBoundingClientRect();
      if (!first || !last) {
        return;
      }
      const trackWidth = (last.right - first.left) / HOME_GRID_COLUMNS;
      if (!(trackWidth > 0)) {
        return;
      }
      const delta = Math.round((event.clientX - drag.startX) / trackWidth);
      const nextSpan = clamp(
        drag.startSpan + delta,
        1,
        HOME_GRID_COLUMNS - drag.col + 1,
      );
      const members = new Set(drag.members);
      setEntries((current) =>
        current.map((entry) => {
          if (!members.has(entry.moduleId)) {
            return entry;
          }
          const box = pickBox(entry, viewport);
          if (box.colSpan === nextSpan) {
            return entry;
          }
          return { ...entry, ...mergeBox(viewport, { ...box, colSpan: nextSpan }) };
        }),
      );
      setDirty(true);
      return;
    }

    if (drag.mode === "resize-h") {
      // 画框是缩放过的：把屏幕位移按「画框视觉高 : 设计高」换算回模块像素，
      // 这样「拖 100px」在任何 zoom 下都是真的长高 100px（P-139）
      const frame = deviceRef.current?.getBoundingClientRect().height || designHeight;
      const nextH = clampModuleHeight(
        drag.startHPct +
          dragDeltaToModulePx(event.clientY - drag.startY, frame, designHeight),
      );
      const entry = entries.find((item) => item.moduleId === drag.moduleId);
      if (!entry) {
        return;
      }
      const box = pickBox(entry, viewport);
      if (box.hPct === nextH) {
        return;
      }
      patchEntry(drag.moduleId, mergeBox(viewport, { ...box, hPct: nextH }));
      return;
    }

    pointerRef.current = { x: event.clientX, y: event.clientY };
    moveChip(event.clientX, event.clientY);
    refreshDropTarget();
    startAutoScroll(event.clientY);
  }

  function finishMove() {
    const drag = dragRef.current;
    dragRef.current = null;
    dropModelRef.current = null;
    pointerRef.current = null;
    stopAutoScroll();
    setDraggingId(null);
    setDropTarget(null);

    if (!drag || drag.mode !== "move" || !dropTarget) {
      return;
    }
    const planned = displayEntries.find((entry) => entry.moduleId === drag.moduleId);
    const origin = entries.find((entry) => entry.moduleId === drag.moduleId);
    if (!planned || !origin) {
      return;
    }
    // 「什么都没变」要连**同格顺序**一起比：在同一个格子里上下挪一位时，
    // row/col/colSpan 全都没变，只有 sort 变了 —— 只比位置会把「同格中间插入」整个丢掉。
    const unchanged =
      origin.row === planned.row &&
      origin.col === planned.col &&
      origin.colSpan === planned.colSpan &&
      origin.sort === planned.sort &&
      displayEntries.length === entries.length &&
      displayEntries.every((entry) => {
        const before = entries.find((item) => item.moduleId === entry.moduleId);
        return Boolean(before) && before?.sort === entry.sort;
      });
    if (unchanged) {
      return;
    }
    setEntries(displayEntries);
    setDirty(true);
  }

  function cancelDrag() {
    if (!dragRef.current) {
      return;
    }
    dragRef.current = null;
    dropModelRef.current = null;
    pointerRef.current = null;
    stopAutoScroll();
    setDraggingId(null);
    setDropTarget(null);
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

  // Esc 取消拖动：挂在 document 的 **capture** 阶段，避免被别的冒泡监听抢走（P-151）
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !dragRef.current) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      cancelDrag();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  });

  // 让位的 FLIP 动画：预览重排时给被推开的模块一个补间（不动布局，只动 transform）
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
      if (!prev || draggingId === null) {
        return;
      }
      const dx = prev.left - rect.left;
      const dy = prev.top - rect.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
        return;
      }
      node.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
        { duration: 220, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
      );
    });
    flipRects.current = next;
  }, [areas, draggingId]);

  function moveWithinStack(moduleId: number, direction: -1 | 1) {
    const entry = entries.find((item) => item.moduleId === moduleId);
    if (!entry) {
      return;
    }
    const box = pickBox(entry, viewport);
    const siblings = boxedEnabled
      .filter(
        (item) =>
          item.row === box.row && item.col === box.col && item.colSpan === box.colSpan,
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

  /** 选中模块所在格子的栏位（同格所有模块一起写，跟宽度手柄一个口径）。 */
  const selectedArea = useMemo(
    () =>
      selectedEntryBox
        ? areas.find(
            (area) =>
              area.row === selectedEntryBox.row &&
              area.col === selectedEntryBox.col &&
              area.colSpan === selectedEntryBox.colSpan,
          ) ?? null
        : null,
    [areas, selectedEntryBox],
  );
  const selectedPin: HomePinMode = selected?.config.pin ?? "auto";

  /** 别处的「下面同列还有格子」：把 selectedArea 的 blocker 翻成可读的名字。 */
  const pinBlocker = useMemo(() => {
    const key = selectedArea?.sideBlockedBy;
    if (!key) {
      return null;
    }
    const [row, col, colSpan] = key.split(":").map(Number);
    const names = boxedAll
      .filter(
        (entry) =>
          entry.row === row && entry.col === col && entry.colSpan === colSpan,
      )
      .map((entry) => entry.name);
    return names.length > 0 ? names.join(" / ") : `第 ${row} 行 · ${col}–${col + colSpan - 1} 列`;
  }, [boxedAll, selectedArea]);

  function setCellPin(mode: HomePinMode) {
    if (!selected || !selectedEntryBox) {
      return;
    }
    const cell = {
      row: selectedEntryBox.row,
      col: selectedEntryBox.col,
      colSpan: selectedEntryBox.colSpan,
    };
    setEntries((current) =>
      current.map((entry) => {
        const box = pickBox(entry, viewport);
        if (box.row !== cell.row || box.col !== cell.col || box.colSpan !== cell.colSpan) {
          return entry;
        }
        const config = { ...entry.config };
        if (mode === "auto") {
          delete config.pin;
        } else {
          config.pin = mode;
        }
        return { ...entry, config };
      }),
    );
    setDirty(true);
  }

  function mergeColumnIntoCell() {
    if (!selected || !selectedEntryBox) {
      return;
    }
    const planned = mergeColumnBelow(
      gridEntries.map((entry) => ({
        moduleId: entry.moduleId,
        row: entry.row,
        col: entry.col,
        colSpan: entry.colSpan,
        sort: entry.sort,
      })),
      selected.moduleId,
    );
    const byModule = new Map(planned.map((item) => [item.moduleId, item]));
    setEntries((current) =>
      current.map((entry) => {
        const next = byModule.get(entry.moduleId);
        if (!next) {
          return entry;
        }
        const box = pickBox(entry, viewport);
        return {
          ...entry,
          ...mergeBox(viewport, {
            ...box,
            row: next.row,
            col: next.col,
            colSpan: next.colSpan,
          }),
          sort: next.sort,
        };
      }),
    );
    setDirty(true);
  }

  async function saveLayout() {
    setError("");
    setSaving(true);
    try {
      const payload = await adminJson<{ data: LayoutApiItem[] }>(
        "/api/admin/home/layout",
        {
          method: "PUT",
          body: JSON.stringify({
            items: entries.map((entry) => ({
              moduleId: entry.moduleId,
              enabled: entry.enabled,
              col: entry.col,
              colSpan: entry.colSpan,
              row: entry.row,
              // sort = 同格堆叠顺序：**必须跟着一起存**，否则「上移/下移」与
              // 「拖进同格第几位」会在保存后被服务端的顺序重算抹掉
              sort: entry.sort,
              // 栏位：显式选过的才带上（`auto` 不写进库，留给以后调启发式）
              pin: entry.config.pin && entry.config.pin !== "auto" ? entry.config.pin : undefined,
              hPct: entry.hPct,
              mobileCol: entry.mobileCol,
              mobileColSpan: entry.mobileColSpan,
              mobileRow: entry.mobileRow,
              mobileHPct: entry.mobileHPct,
            })),
          }),
        },
      );
      // 用服务端返回的格点回写本地：保存刷新前后本地与库里是同一份布局
      setEntries((current) =>
        canonicalizeBoxes(mergeLayoutResponse(current, payload.data ?? [])),
      );
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
        body: JSON.stringify({ config: sanitizeConfig(selected) }),
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
          homeBadgeColor: look.homeBadgeColor.trim(),
          homeBadgeOpacity: look.homeBadgeOpacity,
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
    setEntries((current) =>
      current.map((entry) =>
        entry.moduleId === selected.moduleId
          ? { ...entry, config: { ...entry.config, ...patch } }
          : entry,
      ),
    );
    setDirty(true);
  }

  /** 高度模式：0 = 自适应；切到固定时给该模块的默认高度。 */
  function setHeightMode(auto: boolean) {
    if (!selected || !selectedEntryBox) {
      return;
    }
    const fallback = defaultSizeFor(selected.builtinKey, viewport).hPct;
    patchEntry(
      selected.moduleId,
      mergeBox(viewport, {
        ...selectedEntryBox,
        hPct: auto ? 0 : fallback || 380,
      }),
    );
  }

  function resetSelectedSize() {
    if (!selected || !selected.enabled || !selectedEntryBox) {
      return;
    }
    const size = defaultSizeFor(selected.builtinKey, viewport);
    const next = normalizeBox({
      ...selectedEntryBox,
      colSpan: size.colSpan,
      hPct: size.hPct,
    });
    patchEntry(selected.moduleId, mergeBox(viewport, next));
  }

  const frameVars = {
    "--home-module-fill": `${look.homeModuleOpacity}%`,
    "--home-backdrop-opacity": look.homeBackdropOpacity / 100,
    "--home-badge-color": look.homeBadgeColor || "var(--heo-theme)",
    "--home-badge-opacity": `${look.homeBadgeOpacity}%`,
    // 画框就是「视口」：banner 的 100vh / 70vh 要按设计视口算，而不是后台窗口的高度
    "--vh-unit": `${designHeight / 100}px`,
    width: designWidth,
    height: designHeight,
    zoom: zoomValue,
  } as CSSProperties;

  const paneVars = {
    "--home-module-fill": `${look.homeModuleOpacity}%`,
    "--home-backdrop-opacity": look.homeBackdropOpacity / 100,
    "--home-badge-color": look.homeBadgeColor || "var(--heo-theme)",
    "--home-badge-opacity": `${look.homeBadgeOpacity}%`,
  } as CSSProperties;

  return (
    <div className={cn("home-editor", pane === "canvas" ? "is-canvas" : "is-settings")}>
      <div className="admin-pane-tabs">
        <button
          className={cn("admin-seg__btn", pane === "settings" && "is-on")}
          onClick={() => setPane("settings")}
          type="button"
        >
          设置
        </button>
        <button
          className={cn("admin-seg__btn", pane === "canvas" && "is-on")}
          onClick={() => setPane("canvas")}
          type="button"
        >
          画布
        </button>
      </div>

      <aside className="home-editor__rail">
        <div className="home-editor__rail-body">
          <section className="home-editor__group">
            <h2>外观</h2>
            <p className="admin-muted">
              统一调整首页模块玻璃底与背景图的不透明度，前台立刻生效。
            </p>
            <label className="admin-field">
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
            <label className="admin-field">
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
            <div className="admin-field">
              <span className="admin-field__head">
                徽标颜色
                <button
                  className="admin-field__reset"
                  disabled={!look.homeBadgeColor}
                  onClick={() => {
                    setLook((current) => ({ ...current, homeBadgeColor: "" }));
                    setLookDirty(true);
                  }}
                  type="button"
                >
                  跟随主题
                </button>
              </span>
              <div className="admin-color-row">
                <input
                  aria-label="首页徽标颜色"
                  onChange={(event) => {
                    setLook((current) => ({
                      ...current,
                      homeBadgeColor: event.target.value,
                    }));
                    setLookDirty(true);
                  }}
                  type="color"
                  value={look.homeBadgeColor || "#f59e0b"}
                />
                <span className="admin-muted">
                  {look.homeBadgeColor ? "分类 / 标签 / 瞬间" : "当前跟随主题色"}
                </span>
              </div>
            </div>
            <label className="admin-field">
              徽标底色不透明度（{look.homeBadgeOpacity}%）
              <input
                max={100}
                min={0}
                onChange={(event) => {
                  setLook((current) => ({
                    ...current,
                    homeBadgeOpacity: Number(event.target.value),
                  }));
                  setLookDirty(true);
                }}
                type="range"
                value={look.homeBadgeOpacity}
              />
            </label>
            <button
              className="admin-btn"
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
                      {isFloatingModule(entry)
                        ? "覆盖层"
                        : entry.kind === "custom"
                          ? "自建"
                          : "内置"}
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

              {selected.enabled && selectedEntryBox ? (
                <div className="home-editor__grid-fields">
                  <label className="admin-field">
                    行
                    <input
                      max={committedMaxRow + 1}
                      min={1}
                      onChange={(event) =>
                        patchEntry(
                          selected.moduleId,
                          mergeBox(viewport, {
                            ...selectedEntryBox,
                            row: clamp(
                              Number(event.target.value),
                              1,
                              committedMaxRow + 1,
                            ),
                          }),
                        )
                      }
                      type="number"
                      value={selectedEntryBox.row}
                    />
                  </label>
                  <label className="admin-field">
                    起始列
                    <input
                      max={HOME_GRID_COLUMNS - selectedEntryBox.colSpan + 1}
                      min={1}
                      onChange={(event) =>
                        patchEntry(
                          selected.moduleId,
                          mergeBox(viewport, {
                            ...selectedEntryBox,
                            col: clamp(
                              Number(event.target.value),
                              1,
                              HOME_GRID_COLUMNS - selectedEntryBox.colSpan + 1,
                            ),
                          }),
                        )
                      }
                      type="number"
                      value={selectedEntryBox.col}
                    />
                  </label>
                  <label className="admin-field">
                    宽度（列）
                    <input
                      max={HOME_GRID_COLUMNS - selectedEntryBox.col + 1}
                      min={1}
                      onChange={(event) =>
                        patchEntry(
                          selected.moduleId,
                          mergeBox(viewport, {
                            ...selectedEntryBox,
                            colSpan: clamp(
                              Number(event.target.value),
                              1,
                              HOME_GRID_COLUMNS - selectedEntryBox.col + 1,
                            ),
                          }),
                        )
                      }
                      type="number"
                      value={selectedEntryBox.colSpan}
                    />
                  </label>

                  <div className="home-editor__height">
                    <span>高度</span>
                    <div className="home-editor__seg">
                      <button
                        className={cn(
                          "admin-seg__btn",
                          selectedEntryBox.hPct === 0 && "is-on",
                        )}
                        onClick={() => setHeightMode(true)}
                        type="button"
                      >
                        自适应
                      </button>
                      <button
                        className={cn(
                          "admin-seg__btn",
                          selectedEntryBox.hPct > 0 && "is-on",
                        )}
                        onClick={() => setHeightMode(false)}
                        type="button"
                      >
                        固定
                      </button>
                    </div>
                  </div>

                  {/* ── 栏位：侧面（钉住跟随滚动）还是固定（随页面滚） ─────────────────
                      同格所有模块一起改；「侧面」只有在**这一列里是最后一格**时才真的生效，
                      否则下面同列的格子会滚上来压在它身上（见 grid-model 的 resolvePinnable）。 */}
                  <div className="home-editor__pin">
                    <div className="home-editor__pin-head">
                      <span>栏位</span>
                      <span className="home-editor__tag">
                        {viewport === "mobile"
                          ? "手机档不启用侧面"
                          : selectedArea?.side
                            ? "侧面 · 跟随滚动"
                            : pinBlocker
                              ? "侧面被占列挡住 → 现在是固定"
                              : "固定 · 随页面滚动"}
                      </span>
                    </div>
                    <div className="home-editor__seg">
                      <button
                        className={cn("admin-seg__btn", selectedPin === "auto" && "is-on")}
                        disabled={viewport === "mobile"}
                        onClick={() => setCellPin("auto")}
                        type="button"
                      >
                        自动
                      </button>
                      <button
                        className={cn("admin-seg__btn", selectedPin === "flow" && "is-on")}
                        disabled={viewport === "mobile"}
                        onClick={() => setCellPin("flow")}
                        type="button"
                      >
                        固定
                      </button>
                      <button
                        className={cn("admin-seg__btn", selectedPin === "side" && "is-on")}
                        disabled={viewport === "mobile"}
                        onClick={() => setCellPin("side")}
                        type="button"
                      >
                        侧面
                      </button>
                    </div>
                    <p className="admin-muted">
                      {viewport === "mobile"
                        ? "手机屏幕太窄，侧面栏目会让内容挤在一起 —— 手机档一律随页面滚动。"
                        : pinBlocker
                          ? `「${pinBlocker}」也占着这几列且在下面，贴住会压在它身上。`
                          : "侧面 = 这一格钉在视口里跟随滚动（同格会一起钉住）。"}
                    </p>
                    {viewport !== "mobile" && pinBlocker ? (
                      <button className="admin-btn" onClick={mergeColumnIntoCell} type="button">
                        把下面这一列的模块并进来
                      </button>
                    ) : null}
                  </div>

                  {selectedEntryBox.hPct > 0 ? (
                    <label className="admin-field">
                      高度（px）
                      <input
                        max={H_PCT_MAX}
                        min={H_PCT_MIN}
                        onChange={(event) =>
                          patchEntry(
                            selected.moduleId,
                            mergeBox(viewport, {
                              ...selectedEntryBox,
                              hPct: clampModuleHeight(Number(event.target.value)),
                            }),
                          )
                        }
                        step={H_PCT_STEP}
                        type="number"
                        value={selectedEntryBox.hPct}
                      />
                    </label>
                  ) : (
                    <p className="admin-muted">
                      自适应：高度由模块内容决定（电脑与手机各记各的）。
                    </p>
                  )}

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
                  <button
                    className="admin-btn"
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
                    className="admin-btn"
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
            <p className="admin-error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            className="admin-btn"
            disabled={saving || !dirty}
            onClick={() => void saveLayout()}
            type="button"
          >
            {saving ? "保存中…" : dirty ? "保存布局" : "布局已保存"}
          </button>
        </div>
      </aside>

      <div className="home-editor__canvas-pane" style={paneVars}>
        <header className="home-editor__toolbar">
          <span>
            {viewport === "mobile" ? "手机画框 390×844" : "电脑画框 1440×900"}
            （真实数据预览）
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
              <button
                className={cn(zoom === "fit" && "is-active")}
                onClick={() => setZoom("fit")}
                type="button"
              >
                适应
              </button>
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
            draggingId !== null && "is-dragging",
            autoScrolling && "is-autoscroll",
          )}
          onPointerCancel={cancelDrag}
          onPointerDown={(event) => {
            // 点空白处取消选中（手柄自己 stopPropagation）
            if (event.target === event.currentTarget) {
              setSelectedId(null);
            }
          }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          ref={canvasRef}
        >
          <div
            className={cn("home-editor__device", viewport === "mobile" && "is-phone")}
            // 画布里是真实前台渲染：链接必须保留外观，但**不能把管理员带走**。
            // 拖拽/缩放手柄的 pointerdown 不受影响，只有链接的默认跳转被取消。
            onClickCapture={(event) => {
              if ((event.target as Element).closest("a")) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            onAuxClickCapture={(event) => {
              if ((event.target as Element).closest("a")) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            ref={deviceRef}
            style={frameVars}
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
                      "--cell-col": viewport === "mobile" ? index + 1 : index + 2,
                      "--cell-col-span": 1,
                      "--cell-row": 1,
                    } as CSSProperties
                  }
                />
              ))}

              {areas.map((area) => (
                <div
                  className={area.className}
                  data-area-key={area.key}
                  key={area.key}
                  style={area.style}
                >
                  {area.cells.map((cell) => {
                    const entry = cell.item;
                    const target =
                      draggingId === cell.moduleId ? effective : null;
                    return (
                      <div
                        className={cn(
                          cell.className,
                          "home-editor__cell",
                          selectedId === cell.moduleId && "is-selected",
                          draggingId === cell.moduleId && "is-drop-preview",
                        )}
                        data-cell={`${area.row}:${area.col}:${area.colSpan}`}
                        data-cell-module={cell.moduleId}
                        data-flip-id={String(cell.moduleId)}
                        key={cell.moduleId}
                        style={cell.style}
                      >
                        {previews[cell.moduleId] ?? (
                          <p className="admin-muted">该模块当前没有可渲染内容。</p>
                        )}
                        <div className="home-editor__chrome">
                          <button
                            className="home-editor__badge"
                            onPointerDown={(event) =>
                              onMovePointerDown(event, cell.moduleId)
                            }
                            title="拖动排序：拖到两个模块之间会插入，拖到格子里会并入同格"
                            type="button"
                          >
                            <span aria-hidden="true">⣿</span>
                            <span className="home-editor__badge-name">
                              {entry.name}
                            </span>
                          </button>
                          <span className="home-editor__coords">
                            {area.row} 行 · {area.col}–
                            {area.col + area.colSpan - 1} 列
                            {area.cells.length > 1 ? " · 同格堆叠" : ""}
                            {area.side ? " · 侧面" : " · 固定"}
                            {area.sideBlockedBy ? " · 想贴被占列挡住" : ""}
                          </span>
                          {target ? (
                            <span className="home-editor__drop-note">
                              松手后：第 {target.row} 行 · {target.col}–
                              {target.col + target.colSpan - 1} 列
                              {target.total > 1 ? ` · 同格第 ${target.index + 1} 位` : ""}
                            </span>
                          ) : null}
                          <button
                            className="home-editor__resize is-width"
                            onPointerDown={(event) =>
                              onResizePointerDown(event, {
                                row: area.row,
                                col: area.col,
                                colSpan: area.colSpan,
                                members: area.cells
                                  .filter((item) => item.moduleId !== draggingId)
                                  .map((item) => item.moduleId),
                              })
                            }
                            title="拖动改变宽度（同格一起改）"
                            type="button"
                          >
                            <span className="visually-hidden">调整宽度</span>
                          </button>
                          <button
                            className="home-editor__resize is-height"
                            onPointerDown={(event) =>
                              onResizeHeightPointerDown(
                                event,
                                cell.moduleId,
                                cell.hPct,
                              )
                            }
                            title="拖动改变高度（只改当前视口）"
                            type="button"
                          >
                            <span className="visually-hidden">调整高度</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {floats.length > 0 ? (
              <div className="home-editor__floats">
                {floats.map((entry) => (
                  <div
                    className={cn(
                      "home-editor__float-slot",
                      viewport === "mobile" && "is-mobile",
                    )}
                    data-float-module={entry.moduleId}
                    key={entry.moduleId}
                    style={
                      {
                        "--float-w":
                          viewport === "mobile"
                            ? "auto"
                            : `clamp(280px, ${((entry.colSpan / HOME_GRID_COLUMNS) * designWidth).toFixed(0)}px, 440px)`,
                      } as CSSProperties
                    }
                  >
                    {previews[entry.moduleId]}
                    <div className="home-editor__chrome">
                      <button
                        className="home-editor__badge"
                        onClick={() => setSelectedId(entry.moduleId)}
                        type="button"
                      >
                        <span aria-hidden="true">◆</span>
                        <span className="home-editor__badge-name">{entry.name}</span>
                      </button>
                      <span className="home-editor__coords">覆盖层 · 不占格点</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {uptime ? (
              <div className="home-editor__footer-band">
                <div className="home-editor__chrome">
                  <button
                    className="home-editor__badge"
                    onClick={() => setSelectedId(uptime.moduleId)}
                    type="button"
                  >
                    <span aria-hidden="true">▤</span>
                    <span className="home-editor__badge-name">{uptime.name}</span>
                  </button>
                  <span className="home-editor__coords">
                    由页脚版本信息行渲染 · 不占格点
                  </span>
                </div>
                {previews[uptime.moduleId]}
              </div>
            ) : null}
          </div>

          {areas.length === 0 ? (
            <p className="admin-muted">左侧勾选模块后会出现在这里。</p>
          ) : null}

          {draggingId !== null ? (
            <div className="home-editor__dragchip" ref={chipRef}>
              <strong>{draggedEntry?.name ?? ""}</strong>
              <span>{dropText || "拖动中…"}</span>
              <span className="home-editor__dragchip-hint">
                松手落定 · Esc 取消{autoScrolling ? " · 自动滚动中" : ""}
              </span>
            </div>
          ) : (
            // 空着也保留节点：手柄按下时先写一次位置，下一帧才有内容可显示（避免闪一下左上角）
            <div className="home-editor__dragchip is-idle" ref={chipRef} />
          )}
        </div>
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
        <label className="admin-field">
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
        <label className="admin-field">
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
        <label className="admin-field">
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
        <label className="admin-field">
          {field.label}
          <textarea
            onChange={(event) =>
              onChange({
                [field.name]: parseLineField(field.name, event.target.value, max),
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
        <label className="admin-field">
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

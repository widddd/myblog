"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils/cn";

/** 选项值：数字 id（相册 / 卷）、字符串态（如 `album=none`）、或 `null` = 不指定。 */
export type AdminSelectValue = number | string | null;

export type AdminSelectOption = {
  value: AdminSelectValue;
  label: string;
  /** 次要说明（如「12 张」），排在 label 右侧的弱化文字 */
  hint?: string;
};

/** 面板与触发按钮的间距 */
const GAP = 6;
/** 视口留白：面板贴边时至少留这么多 */
const VIEWPORT_PAD = 8;
/** 面板高度上限（与 .admin-select__list 的 max-height 同口径，这里按可用空间夹一次） */
const MAX_PANEL = 320;
/** 下方空间不足、上方又够时向上翻 */
const MIN_BELOW = 180;
/** 向上翻所需的最小上方空间 */
const MIN_ABOVE = 120;

/**
 * 后台自绘下拉的**唯一实现**：媒体库的「相册 / 卷」这一族全部走它，不再出现原生 `<select>`。
 *
 * 为什么是**浮层**（`createPortal` 到 `document.body` + `position: fixed`）：
 * 面板原来内联展开，是因为它生在 `AdminDialog` 面板（`.admin-dialog__panel` 是 `overflow: auto`）
 * 与媒体库卡片里，内联展开会把下面的内容顶下去；而 `position: absolute` 又会被
 * 祖先的 overflow 裁掉。portal 到 body 天然不受任何祖先 overflow / 层叠上下文影响。
 *
 * 定位：按触发按钮的 `getBoundingClientRect()` 给 `left` / `top` / `minWidth`，
 * **下方空间不足时向上翻**（`top` 换成 `bottom`），并按可用空间夹 `max-height`（超出则面板内滚动）。
 *
 * 关闭：点面板外（document `pointerdown`，触发按钮与面板都按 ref 判 containment）、
 * **Esc**（`preventDefault` + `stopPropagation`——弹窗的 Esc 监听挂在 document 上，
 * 不拦住会把整个弹窗关掉）、页面/祖先滚动与窗口尺寸变化（rect 会失效）、选中一项。
 * 面板**自己内部**的滚动不关面板（面板滚动的事件已停止冒泡）。
 */
export function AdminSelect({
  value,
  options,
  onChange,
  disabled = false,
  label,
  placeholder,
  className,
  id,
  name,
  ariaLabel,
}: {
  value: AdminSelectValue;
  options: AdminSelectOption[];
  onChange: (next: AdminSelectValue) => void;
  disabled?: boolean;
  /** 触发区左侧的灰色前缀（「相册」「卷」「加入相册」…） */
  label?: string;
  /** 没有任何选项被选中时触发区显示的文案 */
  placeholder?: string;
  className?: string;
  id?: string;
  /** 给了就渲染一个同值 `<input type="hidden">`，让外层 GET 表单照常提交（保留原生表单语义） */
  name?: string;
  /** 触发按钮的无障碍名（触发区里已经有可见文字时用它可以更准确，如「要放入的卷」） */
  ariaLabel?: string;
}) {
  const reactId = useId();
  const listId = `${id ?? reactId}-list`;
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(
    () => options.find((option) => sameValue(option.value, value)) ?? null,
    [options, value],
  );

  function close() {
    setOpen(false);
  }

  function toggle() {
    setOpen((current) => !current);
  }

  /**
   * 定位：按触发按钮的 rect 直接写面板的 inline style。
   * **不把位置放进 React state**（geometry 归 DOM，与 `PhotoPile` 同一口径）：
   * 一是不需要为定位多一次渲染，二是 `react-hooks/set-state-in-effect` 会直接报错。
   * 面板初始 `visibility: hidden`，量完（必要时向上翻 + 夹 max-height）再显示，避免闪一下。
   */
  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    // 先把上一次的夹取清掉，否则量到的是被夹过的矮面板
    panel.style.maxHeight = "";
    const natural = panel.getBoundingClientRect().height;
    const below = window.innerHeight - rect.bottom - GAP - VIEWPORT_PAD;
    const above = rect.top - GAP - VIEWPORT_PAD;
    const flip = below < MIN_BELOW && above > MIN_ABOVE && above > below;
    const room = Math.max(flip ? above : below, MIN_BELOW);
    panel.style.maxHeight = `${Math.max(Math.min(natural, room, MAX_PANEL), 120)}px`;
    const width = Math.max(rect.width, 140);
    panel.style.width = `${width}px`;
    panel.style.left = `${Math.min(
      Math.max(rect.left, VIEWPORT_PAD),
      Math.max(window.innerWidth - width - VIEWPORT_PAD, VIEWPORT_PAD),
    )}px`;
    if (flip) {
      panel.style.top = "auto";
      panel.style.bottom = `${window.innerHeight - rect.top + GAP}px`;
    } else {
      panel.style.bottom = "auto";
      panel.style.top = `${rect.bottom + GAP}px`;
    }
    panel.style.visibility = "";
  }, [open]);

  // 关闭行为：点面板外、Esc、滚动 / 尺寸变化（rect 会失效）、选中后由调用点收起
  useEffect(() => {
    if (!open) {
      return;
    }
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      close();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      // **必须注册成 capture**：弹窗（`AdminDialog`）的 Esc 监听挂在 document 的冒泡阶段，
      // 而它可能比本组件先注册（弹窗先开、下拉后开时 listener 顺序不定），
      // 冒泡里再 stopPropagation 已经晚了 —— 弹窗会先把自己关掉。
      // 实测：同一个 document 上 AdminDialog 先注册时，Esc 会把整个弹窗关掉。
      event.preventDefault();
      event.stopPropagation();
      close();
      // 焦点还回触发按钮：Esc 之后键盘用户不该被留在已卸载的面板里
      triggerRef.current?.focus();
    }

    function onScroll(event: Event) {
      // 面板自己滚（列表比面板长）不该关掉面板；页面 / 祖先容器滚动会让 rect 失效
      if (event.target instanceof Node && panelRef.current?.contains(event.target)) {
        return;
      }
      close();
    }

    function onResize() {
      close();
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  function pick(next: AdminSelectValue) {
    close();
    if (!sameValue(next, value)) {
      onChange(next);
    }
  }

  /** 触发器上的键盘操作：方向键/回车展开，展开后焦点交给面板（面板里自己处理）。 */
  function onTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      if (!open) {
        event.preventDefault();
        setOpen(true);
      }
    }
  }

  /**
   * 面板只留方向键导航，**Esc 不在这里处理**：React 的合成事件挂在容器根上，
   * 而弹窗的 Esc 监听直接挂在 document 上 —— 合成事件的顺序同样不可靠。
   * Esc 统一由上面的 document capture 监听收口（那里一定先于弹窗执行）。
   */
  function onListKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    event.preventDefault();
    const items = Array.from(
      panelRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [],
    );
    if (items.length === 0) {
      return;
    }
    const index = items.findIndex((node) => node === document.activeElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next = index < 0 ? (step > 0 ? 0 : items.length - 1) : (index + step + items.length) % items.length;
    items[next]?.focus();
  }

  const displayed = selected ? selected.label : (placeholder ?? "请选择");

  return (
    <div className={cn("admin-select", className)}>
      {name ? <input name={name} type="hidden" value={value === null ? "" : String(value)} /> : null}
      <button
        aria-controls={open ? listId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="admin-select__trigger"
        disabled={disabled}
        id={id}
        onClick={toggle}
        onKeyDown={onTriggerKeyDown}
        ref={triggerRef}
        type="button"
      >
        {label ? <span className="admin-muted">{label}</span> : null}
        <span className={cn("admin-select__value", !selected && "is-placeholder")}>{displayed}</span>
        <span aria-hidden className={cn("admin-select__chevron", open && "is-open")}>
          ⌄
        </span>
      </button>
      {open
        ? createPortal(
            <div
              className="admin-select__list"
              id={listId}
              role="listbox"
              // 让 React 的 keydown 委托监听挂上：Esc 在 capture 阶段就被拦下，
              // 弹窗（直接挂在 document 上的冒泡监听）收不到这次按键，弹窗不会被关掉。
              onKeyDown={onListKeyDown}
              ref={panelRef}
              // 定位由 useLayoutEffect 直接写 style（量完再显示）；这里只给浮层基态
              style={{ bottom: "auto", position: "fixed", top: "auto", visibility: "hidden" }}
            >
              {options.map((option, index) => (
                <button
                  aria-selected={sameValue(option.value, value)}
                  className={cn(
                    "admin-select__option",
                    sameValue(option.value, value) && "is-active",
                  )}
                  key={optionKey(option.value, index)}
                  onClick={() => pick(option.value)}
                  role="option"
                  type="button"
                >
                  <span className="admin-select__option-label">{option.label}</span>
                  {option.hint ? (
                    <span className="admin-select__option-hint">{option.hint}</span>
                  ) : null}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/** 值比较：数字与字符串混在一族里，统一按字符串比，`null` 与空串**不**等价。 */
function sameValue(a: AdminSelectValue, b: AdminSelectValue) {
  if (a === null || b === null) {
    return a === b;
  }
  return String(a) === String(b);
}

function optionKey(value: AdminSelectValue, index: number) {
  return value === null ? `null-${index}` : `${typeof value}-${String(value)}`;
}

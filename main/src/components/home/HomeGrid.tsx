import { HomeModuleRenderer } from "@/components/home/HomeModuleRenderer";
import { isModuleHidden } from "@/lib/client/detect";
import { builtinDefinition } from "@/lib/home/builtins";
import type { HomeData } from "@/lib/home/data";
import { buildHomeAreas } from "@/lib/home/grid-model";
import { isFloatingModule, type HomeLayoutItem } from "@/lib/home/types";

/**
 * 前台首页格点。
 *
 * **布局计算只有一份**：`buildHomeAreas()`（`lib/home/grid-model.ts`）—— 类名与 CSS 变量都从
 * 那里出来，后台画布用同一份，所以「预览 = 前台」不是靠人肉对齐，而是同一段代码。
 *
 * 进不进格点流也只在这里判一次（`skip`）：
 * - 运行时间由页脚画；
 * - 覆盖层模块（弹出模块 / 推荐应用，含用模板建的自建浮层）由 `HomeFloat` 画
 *   —— 判定统一走 `isFloatingModule()`（P-137）；
 * - App 里不展示的模块（推荐应用）连格子一起不进版式，**必须在分组之前**摘掉，
 *   留到最里面的组件 `return null` 会在版式里剩一个空盒子（占位、还能接住点击，P-154）。
 */
export function HomeGrid({
  items,
  data,
  appMode = false,
}: {
  items: HomeLayoutItem[];
  data: HomeData;
  /** 这一发请求来自 App：被藏掉的模块（推荐应用）**连格子一起不进版式**，不留空格子 */
  appMode?: boolean;
}) {
  const areas = buildHomeAreas(items, ({ module, placement }) => ({
    moduleId: module.id,
    builtinKey: module.builtinKey,
    bleed: Boolean(builtinDefinition(module.builtinKey)?.bleed),
    skip:
      module.builtinKey === "uptime" ||
      isFloatingModule(module) ||
      isModuleHidden(module, { appMode }),
    row: placement.row,
    col: placement.col,
    colSpan: placement.colSpan,
    sort: placement.sort,
    hPct: placement.hPct,
    mobileHPct: placement.mobileHPct,
    mobileCol: placement.mobileCol,
    mobileColSpan: placement.mobileColSpan,
    mobileRow: placement.mobileRow,
    // 栏位：`side` = 钉住（侧面）、`flow` = 随页面滚；缺省 auto（窄堆叠=侧面）。
    // 想贴不等于能贴 —— 下面还有占同样列的格子时会被降级成固定（见 grid-model 的 resolvePinnable）
    pin: module.config.pin,
  }));

  return (
    <div className="home-grid">
      {areas.map((area) => (
        <div className={area.className} key={area.key} style={area.style}>
          {area.cells.map((cell) => (
            <div
              className={cell.className}
              data-cell={`${area.row}:${area.col}:${area.colSpan}`}
              data-cell-module={cell.moduleId}
              key={cell.moduleId}
              style={cell.style}
            >
              <HomeModuleRenderer
                data={data}
                module={cell.item.module}
                appMode={appMode}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

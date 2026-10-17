import { ModuleBody } from "@/components/home/HomeModuleRenderer";
import { isModuleHidden } from "@/lib/client/detect";
import { popupEdgeFromColumn } from "@/lib/home/popup";
import { moduleStyleProps, normalizeModuleStyle } from "@/lib/home/style";
import type { HomeData } from "@/lib/home/data";
import {
  HOME_GRID_COLUMNS,
  isFloatingModule,
  type HomeLayoutItem,
} from "@/lib/home/types";
import { cn } from "@/lib/utils/cn";

/**
 * 覆盖层：把所有「浮层模块」画成 `position: fixed` 的卡片，盖在首页所有格子上方
 * （z-index 见 globals.css 的 `--float-z`）。
 *
 * 与格点的关系：浮层模块**不占格点流**（`HomeGrid` 会把它们摘掉），但仍保留一条
 * placement 记录，用它表达：
 * - 列跨度 → 卡片宽度（`--cell-col-span`）；
 * - 列位置 → 贴左 / 居中 / 贴右（`popupEdgeFromColumn`，只影响贴边的那几款）。
 *
 * 垂直位置由模块自己的 `placement` 预设决定（右上 / 右下 / 左侧 / 居中），
 * 四个角与中间的锚点各不相同，交给 `.home-popup--<边>` 那组 CSS 处理。
 *
 * 浮层不只内置那两个：**模板里选了「弹出模块 / 推荐应用」的自建模块同样是浮层**
 * （`ModuleBody` 里落成 `PopupShell`），这样「用模板建一个弹窗」不需要任何额外开关。
 */
export function HomeFloat({
  items,
  data,
  preview = false,
  appMode = false,
}: {
  items: HomeLayoutItem[];
  data: HomeData;
  preview?: boolean;
  /** App 里不展示的浮层（「推荐应用」）连槽位一起不进 DOM —— 空的贴边 `<aside>` 照样压住点击 */
  appMode?: boolean;
}) {
  const floating = items.filter(
    ({ module }) =>
      isFloatingModule(module) && !isModuleHidden(module, { appMode, preview }),
  );
  if (floating.length === 0) {
    return null;
  }

  return (
    <div className={cn("home-float", preview && "is-preview")}>
      {floating.map(({ module, placement }) => {
        const edge = popupEdgeFromColumn(placement.col, HOME_GRID_COLUMNS);

        return (
          <div
            className={cn(
              "home-float__slot",
              edge === "start" && "is-start",
              edge === "center" && "is-center",
              edge === "end" && "is-end",
            )}
            key={module.id}
            style={
              {
                "--cell-col-span": placement.colSpan,
              } as React.CSSProperties
            }
          >
            <ModuleBody
              data={data}
              module={module}
              preview={preview}
              styleAttr={moduleStyleProps(normalizeModuleStyle(module.config.style))}
            />
          </div>
        );
      })}
    </div>
  );
}

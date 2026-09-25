import { HomeModuleRenderer } from "@/components/home/HomeModuleRenderer";
import { builtinDefinition } from "@/lib/home/builtins";
import type { HomeData } from "@/lib/home/data";
import { areaStyle, moduleBoxStyle } from "@/lib/home/grid";
import { toAreas, type HomeLayoutItem } from "@/lib/home/types";
import { cn } from "@/lib/utils/cn";

/** 窄的堆叠格子（侧栏那种）跟随滚动，保持原侧栏 sticky 观感。 */
const STICKY_MAX_SPAN = 6;

export function HomeGrid({
  items,
  data,
}: {
  items: HomeLayoutItem[];
  data: HomeData;
}) {
  const areas = toAreas(
    items
      .filter(({ module }) => module.builtinKey !== "uptime")
      .map(({ module, placement }) => ({ ...placement, module })),
  );

  return (
    <div className="home-grid">
      {areas.map((area) => {
        const visible = area.items;
        const bleed = visible.some(
          ({ module }) => builtinDefinition(module.builtinKey)?.bleed,
        );
        const stacked = visible.length > 1;

        return (
          <div
            className={cn(
              "home-grid__area",
              bleed && "is-bleed",
              stacked && "is-stack",
              stacked && area.colSpan <= STICKY_MAX_SPAN && "is-sticky",
            )}
            key={area.key}
            style={areaStyle(area)}
          >
            {visible.map((item) => (
              <div
                className={cn(
                  "home-grid__cell",
                  `home-grid__cell--${item.module.builtinKey ?? "custom"}`,
                  item.hPct > 0 ? "is-fixed" : "is-hug",
                  item.mobileHPct > 0 ? "is-m-fixed" : "is-m-hug",
                )}
                key={item.module.id}
                style={moduleBoxStyle(item)}
              >
                <HomeModuleRenderer data={data} module={item.module} />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

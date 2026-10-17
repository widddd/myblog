import Link from "next/link";

import { WelcomeChips } from "@/components/home/modules/WelcomeChips";
import { DEFAULT_CHIPS, normalizeChipLabels, normalizeChipVisible } from "@/lib/home/chips";
import type { HomeModuleConfig } from "@/lib/home/types";
import { isSafeHref } from "@/lib/media/url";

/** 泡泡文字：配了就用自己的，没配用默认那 6 个。顺序在客户端打散。 */
function chipLabels(config: HomeModuleConfig): string[] {
  const custom = normalizeChipLabels(config.chips);
  return custom.length > 0 ? custom : DEFAULT_CHIPS;
}

export function WelcomeModule({ config }: { config: HomeModuleConfig }) {
  const lines =
    config.lines && config.lines.length > 0
      ? config.lines.slice(0, 3)
      : ["记录思考", "也记录生活"];
  const chips = chipLabels(config);

  return (
    <section className="dash-welcome glass-card">
      {config.eyebrow ? <p>{config.eyebrow}</p> : null}
      <h2>
        {lines.map((line, index) => (
          <span key={`${line}-${index}`}>
            {index > 0 ? <br /> : null}
            {line}
          </span>
        ))}
      </h2>
      {config.showChips !== false ? (
        <WelcomeChips labels={chips} visible={normalizeChipVisible(config.chipVisible)} />
      ) : null}
      <div className="dash-links">
        {config.primaryLabel ? (
          <Link
            className="dash-link dash-link--hot"
            href={
              config.primaryHref && isSafeHref(config.primaryHref)
                ? config.primaryHref
                : "/posts"
            }
          >
            {config.primaryLabel}
          </Link>
        ) : null}
        {config.secondaryLabel ? (
          <Link
            className="dash-link dash-link--life"
            href={
              config.secondaryHref && isSafeHref(config.secondaryHref)
                ? config.secondaryHref
                : "/moments"
            }
          >
            {config.secondaryLabel}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

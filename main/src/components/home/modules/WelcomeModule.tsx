import Link from "next/link";

import type { HomeModuleConfig } from "@/lib/home/types";
import { isSafeHref } from "@/lib/media/url";

const CHIP_COLORS = [
  "#4db8e8",
  "#5ba3d9",
  "#e38100",
  "#57bd6a",
  "#62c4ee",
  "#ff7c7c",
];

const DEFAULT_CHIPS = ["NX", "TS", "MD", "SQL", "CSS", "UI"];

function chipLabels(config: HomeModuleConfig): string[] {
  const custom = (config.chips ?? [])
    .map((item) => item.trim().slice(0, 8))
    .filter(Boolean)
    .slice(0, 12);
  const labels = custom.length > 0 ? custom : DEFAULT_CHIPS;
  return [...labels, ...labels];
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
        <div className="dash-chips" aria-hidden="true">
          {chips.map((label, index) => (
            <div
              className="dash-chip"
              key={`${label}-${index}`}
              style={{ background: CHIP_COLORS[index % CHIP_COLORS.length] }}
            >
              {label}
            </div>
          ))}
        </div>
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

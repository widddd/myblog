import type { SVGProps } from "react";

/**
 * 麦克风图标。
 *
 * 自绘的原因：`@radix-ui/react-icons@1.3.2` **没有**任何麦克风图标
 * （P-077：写图标名之前先查过包里的 `dist/*.d.ts`，Mic / Microphone 都没有）。
 * 画布与笔画风格跟 Radix 那套对齐（15×15、currentColor、1.2 描边）。
 */
export function MicIcon({
  width = 15,
  height = 15,
  ...props
}: SVGProps<SVGSVGElement> & { width?: number | string; height?: number | string }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={height}
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth={1.2}
      viewBox="0 0 15 15"
      width={width}
      {...props}
    >
      <path d="M7.5 1.6a2 2 0 0 0-2 2v3.6a2 2 0 1 0 4 0V3.6a2 2 0 0 0-2-2Z" />
      <path d="M3.4 7.6a4.1 4.1 0 0 0 8.2 0" />
      <path d="M7.5 11.7v1.9" />
    </svg>
  );
}

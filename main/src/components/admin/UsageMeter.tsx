import type { ReactNode } from "react";

import { formatBytes, usagePercent } from "@/lib/uploads/usage-format";

/**
 * 本机占用条（设置页的媒体库 / 备份页的备份包共用）。
 * 抽出来是因为「自动备份」一节从设置页搬到了备份页——两边都要这条占用条，不能各写一份。
 * 无 hooks、无状态：谁渲染它都行，客户端组件 import 后自动进前端包。
 */
export function UsageMeter({
  title,
  usedBytes,
  maxMB,
  warn,
  children,
}: {
  title: string;
  usedBytes: number;
  maxMB: number;
  warn?: boolean;
  children: ReactNode;
}) {
  const percent = usagePercent(usedBytes, maxMB);
  const hot = warn || percent >= 90;
  return (
    <div className="admin-usage">
      <div className="admin-usage__head">
        <strong>{title}</strong>
        <span className={hot ? "admin-usage__cap is-warn" : "admin-usage__cap"}>
          {formatBytes(usedBytes)} / {maxMB} MB（{percent}%）
        </span>
      </div>
      <div
        aria-hidden
        className={hot ? "admin-usage__bar is-warn" : "admin-usage__bar"}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <ul className="admin-usage__list">{children}</ul>
    </div>
  );
}

export function UsageRow({
  label,
  bytes,
  extra,
  file,
}: {
  label: string;
  bytes: number;
  extra?: string;
  file?: boolean;
}) {
  return (
    <li className={file ? "admin-usage__row is-file" : "admin-usage__row"}>
      <span title={file ? label : undefined}>{label}</span>
      <span>
        {formatBytes(bytes)}
        {extra ? ` · ${extra}` : ""}
      </span>
    </li>
  );
}

"use client";

import { useState, type ReactNode } from "react";

export function AdminSection({
  title,
  children,
  /** 初态：默认展开（保持既有页面行为）；设置类区块传 false，进来先看到主体内容 */
  defaultOpen = true,
  /** 折叠时标题右侧的补充说明（例如当前生效值），可省 */
  hint,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  hint?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <details
      className="admin-section"
      onToggle={(event) => setOpen(event.currentTarget.open)}
      open={open}
    >
      <summary className="admin-section__title">
        <span>{title}</span>
        {hint ? <span className="admin-section__hint">{hint}</span> : null}
      </summary>
      {children}
    </details>
  );
}

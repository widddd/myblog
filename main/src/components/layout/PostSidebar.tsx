"use client";

import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

type PostSidebarProps = {
  toc: ReactNode;
  extras: ReactNode;
};

export function PostSidebar({ toc, extras }: PostSidebarProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn("sticky-stack post-sidebar", expanded && "is-expanded")}>
      <button
        aria-controls="post-sidebar-extras"
        aria-expanded={expanded}
        aria-label={expanded ? "收起侧栏卡片" : "展开侧栏卡片"}
        className="post-sidebar__toggle"
        onClick={() => setExpanded((open) => !open)}
        title={expanded ? "收起侧栏卡片" : "展开侧栏卡片"}
        type="button"
      >
        <span aria-hidden="true" className="post-sidebar__toggle-icon" />
      </button>
      {toc}
      <div hidden={!expanded} id="post-sidebar-extras" className="post-sidebar__extras">
        {extras}
      </div>
    </div>
  );
}

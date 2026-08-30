import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

type SiteShellProps = {
  children: ReactNode;
  sidebar?: ReactNode;
  title?: string;
  className?: string;
};

export function SiteShell({ children, sidebar, title, className }: SiteShellProps) {
  return (
    <div className={cn("site-offset", className)}>
      <div className="site-main" style={{ paddingTop: 24 }}>
        {title ? <h1 className="page-title">{title}</h1> : null}
        <div className="layout">
          <div className="layout__main">{children}</div>
          {sidebar ? <aside className="layout__aside">{sidebar}</aside> : null}
        </div>
      </div>
    </div>
  );
}

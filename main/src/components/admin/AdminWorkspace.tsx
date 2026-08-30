"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { AdminNav } from "@/components/admin/AdminNav";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { cn } from "@/lib/utils/cn";

function isEditorPath(pathname: string) {
  return (
    pathname === "/admin/posts/new" ||
    /^\/admin\/posts\/\d+\/edit$/.test(pathname)
  );
}

export function AdminWorkspace({
  username,
  pendingComments,
  children,
}: {
  username: string;
  pendingComments: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const editor = isEditorPath(pathname);
  const [navOpen, setNavOpen] = useState(true);

  function toggleNav() {
    setNavOpen((current) => !current);
  }

  return (
    <div
      className={cn(
        "admin-workspace",
        editor && "admin-workspace--editor",
        !navOpen && "admin-workspace--nav-collapsed",
      )}
    >
      <aside className={cn("admin-rail", !navOpen && "is-collapsed")}>
        <div className="admin-rail__top">
          <p className="admin-rail__title">{navOpen ? "管理后台" : "管"}</p>
          {navOpen ? (
            <p className="admin-rail__user">{username}</p>
          ) : null}
        </div>
        <AdminNav collapsed={!navOpen} pendingComments={pendingComments} />
        <div className="admin-rail__foot">
          {navOpen ? <LogoutButton /> : null}
          <button
            className="admin-icon-button"
            onClick={toggleNav}
            type="button"
          >
            {navOpen ? "收起栏目" : "展开"}
          </button>
        </div>
      </aside>
      <div className="admin-stage">
        {editor ? null : (
          <header className="admin-header">
            <div>
              <h1>管理后台</h1>
              <p>你好，{username}</p>
            </div>
          </header>
        )}
        {children}
      </div>
    </div>
  );
}

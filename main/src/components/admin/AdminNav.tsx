"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils/cn";

const LINKS = [
  { href: "/admin", label: "仪表盘", short: "盘" },
  { href: "/admin/posts", label: "文章", short: "文" },
  { href: "/admin/posts/new", label: "写文章", short: "写" },
  { href: "/admin/moments", label: "瞬间", short: "瞬" },
  { href: "/admin/home", label: "首页管理", short: "首" },
  { href: "/admin/modules", label: "模块管理", short: "块" },
  { href: "/admin/comments", label: "评论", short: "评" },
  { href: "/admin/uploads", label: "媒体库", short: "媒" },
  { href: "/admin/backups", label: "备份", short: "备" },
  { href: "/admin/updates", label: "更新", short: "更" },
  { href: "/admin/settings", label: "设置", short: "设" },
] as const;

function isActivePath(pathname: string, href: string) {
  if (href === "/admin") {
    return pathname === "/admin";
  }
  if (href === "/admin/posts/new") {
    return pathname === "/admin/posts/new";
  }
  if (href === "/admin/posts") {
    return (
      pathname === "/admin/posts" ||
      /^\/admin\/posts\/\d+\/edit$/.test(pathname)
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav({
  pendingComments = 0,
  collapsed = false,
}: {
  pendingComments?: number;
  collapsed?: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav className={cn("admin-nav", collapsed && "is-collapsed")}>
      {LINKS.map((link) => {
        const active = isActivePath(pathname, link.href);
        return (
          <Link
            className={cn("admin-nav__link", active && "is-active")}
            href={link.href}
            key={link.href}
            title={link.label}
          >
            <span className="admin-nav__short" aria-hidden="true">
              {link.short}
            </span>
            <span className="admin-nav__label">{link.label}</span>
            {link.href === "/admin/comments" && pendingComments > 0 ? (
              <span className="admin-nav__badge">{pendingComments}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

"use client";

import {
  ArchiveIcon,
  BoxIcon,
  ChatBubbleIcon,
  DashboardIcon,
  DotsHorizontalIcon,
  FileTextIcon,
  GearIcon,
  HomeIcon,
  ImageIcon,
  LightningBoltIcon,
  Pencil2Icon,
  ReloadIcon,
} from "@radix-ui/react-icons";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, m } from "motion/react";

import { LogoutButton } from "@/components/admin/LogoutButton";
import { APP_RELEASE_LABEL } from "@/lib/release";
import { cn } from "@/lib/utils/cn";

type Icon = typeof DashboardIcon;

type NavItem = {
  href: string;
  label: string;
  icon: Icon;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

/**
 * 侧栏 11 项分 4 组。分组标题只在展开态显示（折叠态由 CSS 隐藏）。
 * 分组方案见 ADMIN-REWRITE-PLAN.md §5.2 的实测清单。
 */
const RAIL_GROUPS: NavGroup[] = [
  {
    title: "概览",
    items: [{ href: "/admin", label: "仪表盘", icon: DashboardIcon }],
  },
  {
    title: "内容",
    items: [
      { href: "/admin/posts", label: "文章", icon: FileTextIcon },
      { href: "/admin/posts/new", label: "写文章", icon: Pencil2Icon },
      { href: "/admin/moments", label: "瞬间", icon: LightningBoltIcon },
      { href: "/admin/comments", label: "评论", icon: ChatBubbleIcon },
    ],
  },
  {
    title: "资源",
    items: [
      { href: "/admin/home", label: "首页管理", icon: HomeIcon },
      { href: "/admin/modules", label: "模块管理", icon: BoxIcon },
      { href: "/admin/uploads", label: "媒体库", icon: ImageIcon },
    ],
  },
  {
    title: "系统",
    items: [
      { href: "/admin/backups", label: "备份", icon: ArchiveIcon },
      { href: "/admin/updates", label: "更新", icon: ReloadIcon },
      { href: "/admin/settings", label: "设置", icon: GearIcon },
    ],
  },
];

const TABS: NavItem[] = [
  { href: "/admin", label: "仪表盘", icon: DashboardIcon },
  { href: "/admin/posts", label: "文章", icon: FileTextIcon },
  { href: "/admin/moments", label: "瞬间", icon: LightningBoltIcon },
  { href: "/admin/comments", label: "评论", icon: ChatBubbleIcon },
];

const MORE: NavItem[] = [
  { href: "/admin/home", label: "首页管理", icon: HomeIcon },
  { href: "/admin/modules", label: "模块管理", icon: BoxIcon },
  { href: "/admin/uploads", label: "媒体库", icon: ImageIcon },
  { href: "/admin/backups", label: "备份", icon: ArchiveIcon },
  { href: "/admin/updates", label: "更新", icon: ReloadIcon },
  { href: "/admin/settings", label: "设置", icon: GearIcon },
];

const MORE_HREFS = new Set(MORE.map((item) => item.href));

export function isActivePath(pathname: string, href: string) {
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

function moreActive(pathname: string) {
  return [...MORE_HREFS].some((href) => isActivePath(pathname, href));
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
      {RAIL_GROUPS.map((group) => (
        <div className="admin-nav__section" key={group.title}>
          <p className="admin-nav__group">{group.title}</p>
          {group.items.map((link) => {
            const active = isActivePath(pathname, link.href);
            const Icon = link.icon;
            return (
              <Link
                className={cn("admin-nav__link", active && "is-active")}
                href={link.href}
                key={link.href}
                title={link.label}
              >
                {active ? (
                  <m.span
                    className="admin-nav__active"
                    layoutId="admin-rail-active"
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  />
                ) : null}
                <Icon aria-hidden="true" className="admin-nav__short" />
                <span className="admin-nav__label">{link.label}</span>
                {link.href === "/admin/comments" && pendingComments > 0 ? (
                  <span className="admin-nav__badge">{pendingComments}</span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function AdminTabBar({
  pendingComments = 0,
  moreOpen,
  onMore,
}: {
  pendingComments?: number;
  moreOpen: boolean;
  onMore: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="admin-tabbar" aria-label="后台导航">
      {TABS.map((link) => {
        const active = !moreOpen && isActivePath(pathname, link.href);
        const Icon = link.icon;
        return (
          <Link
            className={cn("admin-tabbar__link", active && "is-active")}
            href={link.href}
            key={link.href}
          >
            {active ? (
              <m.span
                className="admin-nav__active"
                layoutId="admin-tab-active"
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              />
            ) : null}
            <Icon aria-hidden="true" className="admin-tabbar__icon" />
            <span>{link.label}</span>
            {link.href === "/admin/comments" && pendingComments > 0 ? (
              <span className="admin-tabbar__badge">{pendingComments}</span>
            ) : null}
          </Link>
        );
      })}
      <button
        aria-expanded={moreOpen}
        className={cn(
          "admin-tabbar__link",
          (moreOpen || moreActive(pathname)) && "is-active",
        )}
        onClick={onMore}
        type="button"
      >
        {moreOpen || moreActive(pathname) ? (
          <m.span
            className="admin-nav__active"
            layoutId="admin-tab-active"
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          />
        ) : null}
        <DotsHorizontalIcon aria-hidden="true" className="admin-tabbar__icon" />
        <span>更多</span>
      </button>
    </nav>
  );
}

export function AdminMoreSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  return (
    <AnimatePresence>
      {open ? (
        <div className="admin-more" role="presentation">
          <m.button
            aria-label="关闭"
            className="admin-dialog__backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            onClick={onClose}
            type="button"
          />
          <m.div
            className="admin-more__panel"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            role="dialog"
            aria-label="更多"
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <span aria-hidden="true" className="admin-dialog__grab" />
            <div className="admin-more__grid">
              {MORE.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    className={cn(
                      "admin-more__link",
                      isActivePath(pathname, link.href) && "is-active",
                    )}
                    href={link.href}
                    key={link.href}
                    onClick={onClose}
                  >
                    <Icon aria-hidden="true" width={20} height={20} />
                    {link.label}
                  </Link>
                );
              })}
            </div>
            <div className="admin-rail__foot" style={{ marginTop: 16 }}>
              <p className="admin-release-mark">{APP_RELEASE_LABEL}</p>
              <LogoutButton />
            </div>
          </m.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

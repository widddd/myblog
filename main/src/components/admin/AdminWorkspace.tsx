"use client";

import { AnimatePresence, m } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowLeftIcon } from "@radix-ui/react-icons";

import {
  AdminMoreSheet,
  AdminNav,
  AdminTabBar,
} from "@/components/admin/AdminNav";
import { AdminMotion } from "@/components/admin/AdminMotion";
import { DashboardAppearancePanel } from "@/components/admin/DashboardAppearancePanel";
import { LogoutButton } from "@/components/admin/LogoutButton";
import type { AdminAccentKey } from "@/lib/admin/accents";
import type { DashboardCards } from "@/lib/admin/dashboard-cards";
import { APP_RELEASE_LABEL } from "@/lib/release";
import { cn } from "@/lib/utils/cn";

const ease = [0.16, 1, 0.3, 1] as const;

function isEditorPath(pathname: string) {
  return (
    pathname === "/admin/posts/new" ||
    /^\/admin\/posts\/\d+\/edit$/.test(pathname) ||
    pathname === "/admin/home" ||
    pathname === "/admin/modules/new" ||
    /^\/admin\/modules\/\d+$/.test(pathname)
  );
}

function pageHeading(pathname: string): { title: string; lead: string } {
  if (pathname === "/admin") {
    return { title: "仪表盘", lead: "看看站点现在的情况" };
  }
  if (pathname.startsWith("/admin/posts")) {
    return { title: "文章", lead: "管理已发布、草稿和定时文章" };
  }
  if (pathname.startsWith("/admin/moments")) {
    return { title: "瞬间", lead: "写短内容，配几张图" };
  }
  if (pathname.startsWith("/admin/comments")) {
    return { title: "评论", lead: "审核、回复或删除" };
  }
  if (pathname.startsWith("/admin/uploads")) {
    return { title: "媒体库", lead: "文章和瞬间用过的图片" };
  }
  if (pathname.startsWith("/admin/backups")) {
    return { title: "备份", lead: "加密可随时开关，非加密也能上云和恢复" };
  }
  if (pathname.startsWith("/admin/updates")) {
    return { title: "更新", lead: "导入新的程序包，重启后自动换上" };
  }
  if (pathname.startsWith("/admin/settings")) {
    return { title: "设置", lead: "站点名字、公告和账号" };
  }
  if (pathname.startsWith("/admin/modules")) {
    return { title: "模块管理", lead: "先建模块，再去首页摆位置" };
  }
  return { title: "管理后台", lead: "管理站点内容" };
}

export function AdminWorkspace({
  username,
  pendingComments,
  accent,
  cards,
  credentialsOnly = false,
  children,
}: {
  username: string;
  pendingComments: number;
  /** 当前配色（来自 Setting adminAccent），同时是「外观」入口的开关依据 */
  accent?: AdminAccentKey;
  /** 概览页卡片显隐（来自 Setting dashboardCards），只在概览页的面板里展示 */
  cards?: DashboardCards;
  credentialsOnly?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editor = !credentialsOnly && isEditorPath(pathname);
  const heading = credentialsOnly
    ? { title: "改账号", lead: "先改成你自己的用户名和密码" }
    : pageHeading(pathname);
  const [navOpen, setNavOpen] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  // 面板开关**从 URL 派生**，不用 useState。原因：同路由只换 query 时（在 /admin 点外观入口
  // → /admin?appearance=1）组件不会重新挂载，useState 的惰性初始化会永远停在首次挂载那一刻
  // 的值——表现就是"点了没反应"。派生后 URL 一变就重渲染，面板自然打开。
  // 关闭时把 query 抹掉，因此下次再点入口仍能打开。
  const appearanceOpen = searchParams.get("appearance") === "1";
  const closeAppearance = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("appearance");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1024px)");
    const sync = () => setNavOpen(!media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return (
    <AdminMotion>
      <div
        className={cn(
          "admin-workspace",
          editor && "admin-workspace--editor",
          credentialsOnly && "admin-workspace--credentials",
          !navOpen && "admin-workspace--nav-collapsed",
        )}
      >
      <aside className={cn("admin-rail", !navOpen && "is-collapsed")}>
        <div className="admin-rail__top">
          <div className="admin-rail__brand">
            <p className="admin-rail__title">{navOpen ? "管理后台" : "管"}</p>
            {navOpen ? <p className="admin-rail__user">{username}</p> : null}
          </div>
          <button
            aria-expanded={navOpen}
            className="admin-pane-toggle"
            onClick={() => setNavOpen((current) => !current)}
            title={navOpen ? "收起栏目" : "展开栏目"}
            type="button"
          >
            <span aria-hidden="true" className="admin-pane-toggle__icon" />
            <span className="visually-hidden">
              {navOpen ? "收起栏目" : "展开栏目"}
            </span>
          </button>
        </div>
        <div className="admin-rail__scroll">
          {credentialsOnly ? (
            <p className="admin-muted">请先修改账号</p>
          ) : (
            <AdminNav collapsed={!navOpen} pendingComments={pendingComments} />
          )}
        </div>
        {navOpen ? (
          <div className="admin-rail__foot">
            <p className="admin-release-mark">{APP_RELEASE_LABEL}</p>
            <LogoutButton />
          </div>
        ) : (
          <div className="admin-rail__foot">
            <p className="admin-release-mark admin-release-mark--collapsed">α</p>
          </div>
        )}
      </aside>
      <div className="admin-main">
        {editor ? null : (
          <header className="admin-topbar">
            <Link className="admin-btn admin-btn--icon admin-topbar__back" href="/" title="返回前台">
              <ArrowLeftIcon />
              <span className="visually-hidden">返回前台</span>
            </Link>
            <div className="admin-topbar__stack">
              <AnimatePresence mode="wait">
                <m.div
                  className="admin-topbar__copy"
                  key={heading.title}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16, ease }}
                >
                  <h1>{heading.title}</h1>
                  <p>{heading.lead}</p>
                </m.div>
              </AnimatePresence>
            </div>
            <p className="admin-topbar__user">你好，{username}</p>
          </header>
        )}
        <AnimatePresence mode="wait">
          <m.div
            className="admin-page-swap"
            key={pathname}
            initial={{ opacity: 0, y: 14 }}
            animate={{
              opacity: 1,
              y: 0,
              transition: { duration: 0.22, ease },
            }}
            exit={{
              opacity: 0,
              y: 8,
              transition: { duration: 0.16, ease },
            }}
          >
            <div className="admin-stage">{children}</div>
          </m.div>
        </AnimatePresence>
      </div>
      {credentialsOnly ? null : (
        <>
          <AdminTabBar
            moreOpen={moreOpen}
            onMore={() => setMoreOpen((current) => !current)}
            pendingComments={pendingComments}
          />
          <AdminMoreSheet onClose={() => setMoreOpen(false)} open={moreOpen} />
          {accent ? (
            <DashboardAppearancePanel
              accent={accent}
              cards={cards}
              onClose={closeAppearance}
              open={appearanceOpen}
              showCards={pathname === "/admin"}
            />
          ) : null}
        </>
      )}
      </div>
    </AdminMotion>
  );
}

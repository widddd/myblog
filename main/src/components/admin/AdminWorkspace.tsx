"use client";

import {
  useEffect,
  useRef,
  useState,
  type AnimationEvent,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

import { AdminNav } from "@/components/admin/AdminNav";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { APP_RELEASE_LABEL } from "@/lib/release";
import { cn } from "@/lib/utils/cn";

/** 满高分栏布局：写文章、首页画布、模块编辑器都靠它撑满视口（P-033）。 */
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
  credentialsOnly = false,
  children,
}: {
  username: string;
  pendingComments: number;
  credentialsOnly?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [shownPath, setShownPath] = useState(pathname);
  const [shownChildren, setShownChildren] = useState(children);
  const [phase, setPhase] = useState<"in" | "out">("in");
  const pendingRef = useRef({ path: pathname, node: children });
  const editor = !credentialsOnly && isEditorPath(shownPath);
  const shownHeading = credentialsOnly
    ? { title: "改账号", lead: "先改成你自己的用户名和密码" }
    : pageHeading(shownPath);
  const liveHeading = credentialsOnly
    ? shownHeading
    : pageHeading(pathname);
  const titleCrossfading = !editor && shownPath !== pathname;
  const [navOpen, setNavOpen] = useState(true);

  useEffect(() => {
    pendingRef.current = { path: pathname, node: children };
    if (pathname === shownPath) {
      setShownChildren(children);
      return;
    }
    setPhase((current) => (current === "out" ? current : "out"));
  }, [pathname, children, shownPath]);

  useEffect(() => {
    if (phase !== "out") {
      return;
    }
    const timer = window.setTimeout(() => {
      const next = pendingRef.current;
      setShownPath(next.path);
      setShownChildren(next.node);
      setPhase("in");
    }, 200);
    return () => window.clearTimeout(timer);
  }, [phase]);

  function handleSwapEnd(event: AnimationEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || phase !== "out") {
      return;
    }
    const next = pendingRef.current;
    setShownPath(next.path);
    setShownChildren(next.node);
    setPhase("in");
  }

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
          <div className="admin-rail__brand">
            <p className="admin-rail__title">{navOpen ? "管理后台" : "管"}</p>
            {navOpen ? (
              <p className="admin-rail__user">{username}</p>
            ) : null}
          </div>
          <button
            aria-expanded={navOpen}
            className="admin-pane-toggle"
            onClick={toggleNav}
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
            <div className="admin-topbar__stack">
              {titleCrossfading ? (
                <div className="admin-topbar__copy is-leave">
                  <h1>{shownHeading.title}</h1>
                  <p>{shownHeading.lead}</p>
                </div>
              ) : null}
              <div
                className={cn(
                  "admin-topbar__copy",
                  titleCrossfading && "is-enter",
                )}
              >
                <h1>
                  {titleCrossfading ? liveHeading.title : shownHeading.title}
                </h1>
                <p>
                  {titleCrossfading ? liveHeading.lead : shownHeading.lead}
                </p>
              </div>
            </div>
            <p className="admin-topbar__user">你好，{username}</p>
          </header>
        )}
        <div
          className={cn(
            "admin-page-swap",
            phase === "out" ? "is-out" : "is-in",
          )}
          onAnimationEnd={handleSwapEnd}
        >
          <div className="admin-stage">{shownChildren}</div>
        </div>
      </div>
    </div>
  );
}

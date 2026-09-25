"use client";

import { ColorWheelIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { NAV_LINKS } from "@/components/layout/nav-links";
import { cn } from "@/lib/utils/cn";

type NavbarProps = {
  siteName: string;
  /** 已登录管理员：多渲染一个「外观」入口（访客拿到的 HTML 里没有它） */
  isAdmin?: boolean;
};

export function Navbar({ siteName, isAdmin = false }: NavbarProps) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [themeReady, setThemeReady] = useState(pathname !== "/");
  const [indicator, setIndicator] = useState({
    left: 0,
    width: 0,
    ready: false,
  });
  const overlay = pathname === "/" || /^\/posts\/[^/]+$/.test(pathname);
  const isHome = pathname === "/";

  useEffect(() => {
    const update = () => {
      const y = window.scrollY;
      setScrolled(y > 16);
      if (pathname === "/") {
        setThemeReady(y > 72);
      } else {
        setThemeReady(true);
      }
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [pathname]);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) {
      return;
    }

    function measure() {
      const node = navRef.current;
      if (!node) {
        return;
      }
      const active = node.querySelector("a.is-active");
      if (!(active instanceof HTMLElement)) {
        setIndicator((current) => ({ ...current, width: 0 }));
        return;
      }
      const navBox = node.getBoundingClientRect();
      const box = active.getBoundingClientRect();
      setIndicator((current) => ({
        left: box.left - navBox.left,
        width: box.width,
        ready: current.ready,
      }));
    }

    measure();
    const frame = requestAnimationFrame(() => {
      setIndicator((current) => ({ ...current, ready: true }));
    });
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <>
      <header
        className={cn(
          "site-navbar",
          overlay ? "is-overlay" : "is-solid",
          scrolled && "is-scrolled",
        )}
      >
        <div className="site-navbar__inner">
          <Link className="site-brand" href="/" aria-label={`${siteName} 首页`}>
            {siteName}
          </Link>
          <nav className="site-nav" aria-label="主导航" ref={navRef}>
            <span
              aria-hidden="true"
              className={cn(
                "site-nav__indicator",
                indicator.ready && "is-ready",
              )}
              style={{
                transform: `translateX(${indicator.left}px)`,
                width: indicator.width,
              }}
            />
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                className={cn(isActive(pathname, link.href) && "is-active")}
                href={link.href}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="nav-trailing">
            <Link className="nav-icon-btn" href="/search" aria-label="搜索">
              ⌕
            </Link>
            {/* 外观入口：只在管理员已登录时渲染（由 SiteHeader 在服务端判定）。
                跳到后台并带 marker，概览页会直接把外观面板打开——前台不引入 admin.css，
                面板的样式在后台那边，所以这里不原地弹。 */}
            {isAdmin ? (
              <Link
                aria-label="外观设置"
                className="nav-icon-btn"
                href="/admin?appearance=1"
                title="外观设置"
              >
                <ColorWheelIcon aria-hidden="true" />
              </Link>
            ) : null}
            <div
              className={cn(
                "theme-toggle-slot",
                themeReady && "is-open",
                isHome && "is-home-gated",
              )}
            >
              <ThemeToggle />
            </div>
            <button
              className="nav-icon-btn nav-burger"
              type="button"
              aria-label="打开菜单"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              ☰
            </button>
          </div>
        </div>
      </header>
      <div className={cn("mobile-drawer", menuOpen && "is-open")}>
        <button
          className="mobile-drawer__mask"
          type="button"
          aria-label="关闭菜单"
          onClick={() => setMenuOpen(false)}
        />
        <nav className="mobile-drawer__panel" aria-label="移动导航">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              className={cn(isActive(pathname, link.href) && "is-active")}
              href={link.href}
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}

function isActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

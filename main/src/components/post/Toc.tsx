"use client";

import { useEffect, useState, type MouseEvent } from "react";

import type { TocItem } from "@/lib/markdown/toc";

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function scrollToHeading(id: string, behavior: ScrollBehavior) {
  const target = document.getElementById(id);
  if (!target) {
    return false;
  }
  target.scrollIntoView({ behavior, block: "start" });
  return true;
}

export function Toc({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);

  useEffect(() => {
    const nodes = items
      .map((item) => document.getElementById(item.id))
      .filter((node): node is HTMLElement => node !== null);
    if (nodes.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const id = visible[0]?.target.id;
        if (id) {
          setActiveId(id);
        }
      },
      {
        rootMargin: "-96px 0px -62% 0px",
        threshold: [0, 1],
      },
    );

    for (const node of nodes) {
      observer.observe(node);
    }
    return () => observer.disconnect();
  }, [items]);

  function onItemClick(event: MouseEvent<HTMLAnchorElement>, id: string) {
    event.preventDefault();
    setActiveId(id);
    const behavior = prefersReducedMotion() ? "auto" : "smooth";
    if (scrollToHeading(id, behavior)) {
      window.history.replaceState(null, "", `#${encodeURIComponent(id)}`);
    }
  }

  return (
    <section className="widget glass-card">
      <h2 className="widget__title">目录</h2>
      {items.length === 0 ? (
        <p className="widget__empty">本文没有小节。</p>
      ) : (
        <nav aria-label="文章目录">
          <ol className="toc-list">
            {items.map((item, index) => {
              const active = item.id === activeId;
              return (
                <li
                  className={`toc-list__item toc-list__item--depth-${item.depth}${
                    active ? " is-active" : ""
                  }`}
                  key={`${item.id}-${index}`}
                >
                  <a
                    aria-current={active ? "location" : undefined}
                    href={`#${encodeURIComponent(item.id)}`}
                    onClick={(event) => onItemClick(event, item.id)}
                  >
                    {item.text}
                  </a>
                </li>
              );
            })}
          </ol>
        </nav>
      )}
    </section>
  );
}

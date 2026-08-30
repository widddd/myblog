"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import type { SearchHit } from "@/lib/search/types";

type SearchResponse = {
  data?: SearchHit[];
  message?: string;
};

export function SearchDialog() {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) {
    return null;
  }
  return <SearchDialogPanel key={pathname} />;
}

function SearchDialogPanel() {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const keyword = query.trim();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
      inputRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open || !keyword) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      void fetch(`/api/search?q=${encodeURIComponent(keyword.slice(0, 80))}`, {
        signal: controller.signal,
        cache: "no-store",
      })
        .then(async (response) => {
          const body = (await response.json()) as SearchResponse;
          if (!response.ok) {
            throw new Error(body.message || "搜索失败");
          }
          setHits(body.data ?? []);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          setHits([]);
        })
        .finally(() => setLoading(false));
    }, 200);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, keyword]);

  return (
    <dialog
      aria-labelledby={titleId}
      className="search-dialog"
      onClose={() => setOpen(false)}
      ref={dialogRef}
    >
      <div className="search-dialog__panel">
        <h2 id={titleId}>搜索文章</h2>
        <input
          aria-label="搜索关键词"
          maxLength={80}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (keyword) {
                setOpen(false);
                router.push(`/search?q=${encodeURIComponent(keyword)}`);
              }
            }
          }}
          placeholder="搜索标题与正文（⌘K）"
          ref={inputRef}
          type="search"
          value={query}
        />
        <div className="search-dialog__results">
          {loading ? <p className="widget__pending">搜索中…</p> : null}
          {!loading && keyword && hits.length === 0 ? (
            <p className="widget__pending">没有匹配的文章</p>
          ) : null}
          <ul>
            {(keyword ? hits : []).map((hit) => (
              <li key={hit.slug}>
                <Link href={`/posts/${hit.slug}`} onClick={() => setOpen(false)}>
                  <span>{hit.title}</span>
                  {hit.locked ? (
                    <span className="chip chip--locked">密码</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <button
          className="search-dialog__close"
          onClick={() => setOpen(false)}
          type="button"
        >
          关闭
        </button>
      </div>
    </dialog>
  );
}

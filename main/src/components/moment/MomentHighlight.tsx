"use client";

import { useEffect } from "react";

/** 高亮持续多久（毫秒）：落地与「已经在这一页再点一次」都走这个时长 */
const FLASH_MS = 3200;
const FLASH_CLASS = "moment-card--flash";

function cardForHash(): HTMLElement | null {
  const id = window.location.hash.replace(/^#/, "");
  if (!id) {
    return null;
  }
  const node = document.getElementById(id);
  return node ? node.closest<HTMLElement>(".moment-card") : null;
}

function cardForLink(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) {
    return null;
  }
  const anchor = node.closest("a[href*='#moment-']");
  const href = anchor?.getAttribute("href") ?? "";
  const id = href.split("#")[1];
  if (!id) {
    return null;
  }
  const target = document.getElementById(id);
  return target ? target.closest<HTMLElement>(".moment-card") : null;
}

/**
 * 从首页瞬间卡跳进来时（`/moments#moment-12`）滚动到那条瞬间并短暂高亮。
 *
 * 为什么自己做而不用 `:target`：从首页进来是首次加载，浏览器会跳，
 * 之后再点同一张卡 hash 不变、`:target` 也不会重新闪。
 * 这里除了 hashchange，还挂一层锚点点击的委托监听 —— `hashchange` 在
 * 「hash 没变」时根本不触发，光靠它重复点同一张卡就没反馈了。
 */
export function MomentHighlight() {
  useEffect(() => {
    let timer = 0;

    const flash = (card: HTMLElement | null) => {
      if (!card) {
        return;
      }
      card.classList.remove(FLASH_CLASS);
      // 重排一次，让同一个元素上的动画能重新播放
      void card.offsetWidth;
      card.classList.add(FLASH_CLASS);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        card.classList.remove(FLASH_CLASS);
      }, FLASH_MS);
    };

    // 首次落地：浏览器自己会按 hash 跳，这里补平滑滚动 + 高亮
    const card = cardForHash();
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    flash(card);

    const onClick = (event: MouseEvent) => {
      const target = cardForLink(event.target);
      if (target) {
        flash(target);
      }
    };
    const onHashChange = () => {
      flash(cardForHash());
    };

    document.addEventListener("click", onClick);
    window.addEventListener("hashchange", onHashChange);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("hashchange", onHashChange);
      window.clearTimeout(timer);
    };
  }, []);

  return null;
}

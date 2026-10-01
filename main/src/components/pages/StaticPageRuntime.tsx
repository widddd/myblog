"use client";

import { useEffect, useRef } from "react";

/**
 * 静态页面的 HTML/CSS/JS 运行时（管理员内容面，见 docs/pitfalls.md P-034）。
 *
 * 与首页自建模块的 `CustomModuleRuntime` 同一决策面：只有 requireAdmin 能写这三段内容，
 * 按用户决策**不过** MDX sanitize 管线，等价于管理员可以 XSS 自己的站。
 * 评论/昵称链路仍然是纯文本，禁止复用这条路径。
 *
 * 与首页模块的差异：CSS 不做 `.scope{...}` 包裹——静态页是独立文档，写 `body{}` / `*{}`
 * 是合理用法，所以这里不做作用域限制。
 *
 * 已知限制（写在后台编辑器提示里，不假装能兜住）：
 * - HTML 里内联的 `<script>` 不会被浏览器执行（innerHTML 语义）。要跑脚本就写进 JS 栏。
 * - JS 里设的定时器 / 全局监听在离开本页时不会被自动清理，属于管理员代码自负其责的部分；
 *   这里刻意**不**去 patch `setTimeout` / `EventTarget.prototype` 做全局接管——那会连
 *   React 与全站的监听一起劫持，代价远大于收益。
 */
export function StaticPageRuntime({
  pageId,
  html,
  css,
  js,
}: {
  pageId: number;
  html: string;
  css: string;
  js: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !js.trim()) {
      return;
    }

    // innerHTML 里的 <script> 不会执行，必须显式建节点。
    // 单页出错只打日志，不影响站点其它部分。
    const element = document.createElement("script");
    element.dataset.staticPage = String(pageId);
    element.textContent = `(function(){try{\n${js}\n}catch(error){console.error("[static-page:${pageId}]",error);}})();`;
    host.appendChild(element);

    return () => {
      element.remove();
    };
  }, [js, pageId]);

  return (
    <div className="static-page" data-page-id={pageId} ref={hostRef}>
      {css.trim() ? <style data-static-page={pageId}>{css}</style> : null}
      {html.trim() ? <div dangerouslySetInnerHTML={{ __html: html }} /> : null}
    </div>
  );
}

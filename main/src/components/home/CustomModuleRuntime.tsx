"use client";

import { useEffect, useRef } from "react";

/**
 * 自建模块的 HTML/CSS/JS 运行时。
 *
 * 只有管理员能写这些字段（见 docs/pitfalls.md P-034）：内容按用户决策直接注入当前页面，
 * 不过 MDX sanitize 管线。评论/昵称链路仍然是纯文本，禁止复用这条路径。
 */
export function CustomModuleRuntime({
  slug,
  html,
  css,
  js,
  scopedCss = true,
}: {
  slug: string;
  html: string;
  css: string;
  js: string;
  scopedCss?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const scopeClass = `home-custom--${slug}`;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !js.trim()) {
      return;
    }

    // innerHTML 里的 <script> 不会执行，必须显式建节点。
    // 单模块出错只打日志，不能连坐整页。
    const element = document.createElement("script");
    element.dataset.homeModule = slug;
    element.textContent = `(function(){try{\n${js}\n}catch(error){console.error("[home-module:${slug}]",error);}})();`;
    host.appendChild(element);

    return () => {
      element.remove();
    };
  }, [js, slug]);

  return (
    <div className={`home-custom ${scopeClass}`} ref={hostRef}>
      {css.trim() ? (
        <style>{scopedCss ? `.${scopeClass}{${css}}` : css}</style>
      ) : null}
      {html.trim() ? <div dangerouslySetInnerHTML={{ __html: html }} /> : null}
    </div>
  );
}

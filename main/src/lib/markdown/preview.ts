import { renderMdx } from "./mdx";

export const MAX_PREVIEW_CHARS = 200_000;

export async function renderMdxHtml(source: string): Promise<string> {
  // Turbopack 的生产构建会把静态 `react-dom/server` 导入当成客户端误用而报错，
  // 这里只在 route handler 真正调用时动态载入。
  const { renderToStaticMarkup } = await import("react-dom/server");
  const content = await renderMdx(source);
  return renderToStaticMarkup(content);
}

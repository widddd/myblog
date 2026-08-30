import { renderToStaticMarkup } from "react-dom/server";

import { renderMdx } from "./mdx";

export const MAX_PREVIEW_CHARS = 200_000;

export async function renderMdxHtml(source: string): Promise<string> {
  const content = await renderMdx(source);
  return renderToStaticMarkup(content);
}

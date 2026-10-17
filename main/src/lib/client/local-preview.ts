/**
 * 「本机文件预览」登记表：**上传后立刻预览时，别再回头找服务器要一遍图**。
 *
 * 场景（用户实测反馈）：后台发瞬间 / 写文章插图，选完文件是「先入库本地原图、发布时才上云」
 * （`defer: true`，见 P-056）。此时服务端返回的 `original.url` 是站内中转地址
 * `/api/uploads/media/…`——浏览器明明手里就有这个文件，却要再走一次网络把它拉回来渲染预览：
 * 一张 3–5 MB 的原图在慢网下要等好几秒，白花流量，也白占服务端带宽。
 *
 * 做法：上传时把「服务端给的那个地址」和「本机文件的 blob URL」登记成一对，
 * 预览处先问 `resolveLocalPreview(url)`，命中就用 blob，没命中（刷新过页面、媒体库选来的图）
 * 再回退到服务端地址——**语义不变，只是省掉一次多余的回源**。
 *
 * 生命周期（谁创建谁回收，见 P-150）：
 * - blob 由本模块创建，跟着**页面（编辑会话）**走：刷新页面自然消失，届时回退到服务端地址，正确。
 * - 明确知道某张图不会再显示时（从九宫格里删掉、换封面）调用 `releaseLocalPreview(url)` 立刻回收。
 * - **不做容量淘汰**：淘汰会在图还挂在页面上时把 blob 撤销（重挂 `<img>` 就成了破图），
 *   宁可留着几个 MB 到离开页面为止。
 */

type PreviewEntry = {
  objectUrl: string;
  createdAt: number;
};

const entries = new Map<string, PreviewEntry>();

function canCreateObjectUrl(): boolean {
  return (
    typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
  );
}

/**
 * 登记一条「服务端地址 → 本机 blob」的映射，返回可用的预览地址（失败时返回 null）。
 * 同一个服务端地址重复登记只保留第一份（同一张图被选两次不会多占一份内存）。
 */
export function registerLocalPreview(file: File, url: string): string | null {
  if (!url || !file || !canCreateObjectUrl()) {
    return null;
  }
  const existing = entries.get(url);
  if (existing) {
    return existing.objectUrl;
  }
  let objectUrl: string;
  try {
    objectUrl = URL.createObjectURL(file);
  } catch {
    return null;
  }
  entries.set(url, { objectUrl, createdAt: Date.now() });
  return objectUrl;
}

/** 批量登记（`files[i]` 对应 `urls[i]`）：上传多张图时的常用形状。 */
export function registerLocalPreviews(files: File[], urls: string[]): void {
  const count = Math.min(files.length, urls.length);
  for (let index = 0; index < count; index += 1) {
    registerLocalPreview(files[index], urls[index]);
  }
}

/** 取本机预览地址；没有登记过（或已被回收）返回 null，调用方回退到原地址。 */
export function resolveLocalPreview(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  return entries.get(url)?.objectUrl ?? null;
}

/** 回收一条映射（图已经从界面上去掉时调用）。 */
export function releaseLocalPreview(url: string | null | undefined): void {
  if (!url) {
    return;
  }
  const entry = entries.get(url);
  if (!entry) {
    return;
  }
  entries.delete(url);
  if (canCreateObjectUrl()) {
    URL.revokeObjectURL(entry.objectUrl);
  }
}

/** 回收这一批地址对应的预览（九宫格删除 / 整体清空时用）。 */
export function releaseLocalPreviews(urls: Iterable<string | null | undefined>): void {
  for (const url of urls) {
    releaseLocalPreview(url);
  }
}

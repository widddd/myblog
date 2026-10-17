import { cachedPublic, PUBLIC_CACHE_TAGS } from "@/lib/cache/public";
import { postHref } from "@/lib/posts/path";
import { listArchivePosts } from "@/lib/posts/query";
import { getPublicSettings } from "@/lib/settings";
import { getSiteOrigin } from "@/lib/seo/site";

/**
 * 文章订阅（`/rss.xml`）。**只管文章**——瞬间不在这个 feed 里，原因见文末。
 *
 * 时效口径（改这里的数字之前先读这段）：
 *  - 出参 `Cache-Control` 的 `s-maxage` 是**分发侧新鲜窗口**，`stale-while-revalidate` 是过期后
 *    仍可先给旧值的宽限（stale-while-revalidate 与 revalidateTag("max") 是同一套语义，见 P-089）。
 *    所以订阅者看到新文章的最坏延迟 ≈ `s-maxage + stale-while-revalidate`。
 *  - 这条路由的内容又包在 `cachedPublic(..., revalidate = 60)` 里（服务端数据缓存 60s）：
 *    s-maxage 必须 ≤ 它，否则 CDN 会拿着比数据缓存更新的承诺把旧列表发出去。
 *  - 取 30 + 120：最长约 2.5 分钟、命中缓存时几乎零成本（1GB 内存的机器经不起按秒重算）。
 *    要「发出来就到」就再压小，代价是每次轮询都要重新查库 + 渲染 XML。
 *
 * 为什么瞬间不在这里：rss 只有一条 channel，把瞬间混进文章列表会让订阅者分不清两类内容；
 * 而且瞬间有**可见期**（`lib/moments/visibility.ts`：过期即对外不存在），一个"会自己变少"的
 * feed 对阅读器不友好。瞬间的实时性由 `/moments`（`dynamic = "force-dynamic"`，永远现算）保证，
 * App 侧的通知走 `/api/feed/updates`（文章 + 瞬间，增量）。
 */

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export async function GET() {
  const xml = await cachedPublic(
    ["rss.xml"],
    [PUBLIC_CACHE_TAGS.seo, PUBLIC_CACHE_TAGS.posts],
    async () => {
      const [origin, settings, posts] = await Promise.all([
        getSiteOrigin(),
        getPublicSettings(),
        listArchivePosts(),
      ]);
      const publicPosts = posts.filter((post) => !post.locked).slice(0, 30);
      const items = publicPosts
        .map((post) => {
          const link = `${origin}${postHref(post)}`;
          const pubDate = post.publishedAt
            ? new Date(post.publishedAt).toUTCString()
            : "";
          return `<item>
<title>${escapeXml(post.title)}</title>
<link>${escapeXml(link)}</link>
<guid>${escapeXml(link)}</guid>
${pubDate ? `<pubDate>${pubDate}</pubDate>` : ""}
${post.excerpt ? `<description>${escapeXml(post.excerpt)}</description>` : ""}
</item>`;
        })
        .join("\n");

      return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>${escapeXml(settings.siteName)}</title>
<link>${escapeXml(origin)}</link>
<description>${escapeXml(`${settings.siteName} 的文章订阅`)}</description>
${items}
</channel>
</rss>`;
    },
  );

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
    },
  });
}

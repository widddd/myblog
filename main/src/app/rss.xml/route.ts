import { cachedPublic, PUBLIC_CACHE_TAGS } from "@/lib/cache/public";
import { postHref } from "@/lib/posts/path";
import { listArchivePosts } from "@/lib/posts/query";
import { getPublicSettings } from "@/lib/settings";
import { getSiteOrigin } from "@/lib/seo/site";

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
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}

import type { MetadataRoute } from "next";

import { getSiteOrigin } from "@/lib/seo/site";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await getSiteOrigin();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/admin/", "/api/admin", "/api/auth"],
    },
    sitemap: `${origin}/sitemap.xml`,
  };
}

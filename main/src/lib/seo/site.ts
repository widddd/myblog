import type { Metadata } from "next";

import { getSetting } from "@/lib/settings";

const DEV_ORIGIN = "http://localhost:3000";

export function normalizeSiteOrigin(value: string): string | null {
  const trimmed = value.trim().replace(/\/$/, "");
  if (!trimmed) {
    return null;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol === "https:") {
      return url.origin;
    }
    if (
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    ) {
      return url.origin;
    }
  } catch {
    return null;
  }
  return null;
}

export async function getSiteOrigin(): Promise<string> {
  const fromSettings = await getSetting<string>("siteUrl");
  return (
    normalizeSiteOrigin(fromSettings ?? "") ||
    normalizeSiteOrigin(process.env.SITE_URL ?? "") ||
    DEV_ORIGIN
  );
}

export async function publicMetadata(input: {
  title: string;
  description?: string;
  path: string;
  index?: boolean;
}): Promise<Metadata> {
  const origin = await getSiteOrigin();
  const url = `${origin}${input.path.startsWith("/") ? input.path : `/${input.path}`}`;
  const description = input.description;
  const index = input.index !== false;

  return {
    title: input.title,
    description,
    alternates: { canonical: url },
    robots: index
      ? { index: true, follow: true }
      : { index: false, follow: false },
    openGraph: {
      title: input.title,
      description,
      url,
      type: "website",
    },
  };
}

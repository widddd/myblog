import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { Footer } from "@/components/layout/Footer";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { AppChrome } from "@/components/layout/AppChrome";
import { ThemeInit } from "@/components/layout/ThemeInit";
import { hasAdminUser } from "@/lib/auth/initial-setup";
import { getPublicSettings } from "@/lib/settings";
import { getSiteOrigin } from "@/lib/seo/site";

import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const [{ siteName }, origin] = await Promise.all([
    getPublicSettings(),
    getSiteOrigin(),
  ]);
  const description = "记录思考，也记录生活。";
  return {
    metadataBase: new URL(origin),
    title: {
      default: siteName,
      template: `%s · ${siteName}`,
    },
    description,
    alternates: {
      canonical: origin,
      types: {
        "application/rss+xml": "/rss.xml",
      },
    },
    openGraph: {
      title: siteName,
      description,
      url: origin,
      siteName,
      locale: "zh_CN",
      type: "website",
    },
    robots: { index: true, follow: true },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const pathname = (await headers()).get("x-myblog-pathname") ?? "";
  const onSetup =
    pathname === "/admin/setup" || pathname.startsWith("/admin/setup/");
  if (!onSetup && !(await hasAdminUser())) {
    redirect("/admin/setup");
  }

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <ThemeInit />
        <AppChrome />
        <SiteHeader />
        {children}
        <Footer showUptime={pathname === "/"} />
      </body>
    </html>
  );
}

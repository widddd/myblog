import type { Metadata } from "next";

import { Footer } from "@/components/layout/Footer";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { AppChrome } from "@/components/layout/AppChrome";
import { getPublicSettings } from "@/lib/settings";

import "./globals.css";

const themeScript = `
(() => {
  try {
    const stored = localStorage.getItem("myblog-theme");
    const theme = stored === "light" || stored === "dark"
      ? stored
      : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch {}
})();
`;

export async function generateMetadata(): Promise<Metadata> {
  const { siteName } = await getPublicSettings();
  return {
    title: {
      default: siteName,
      template: `%s · ${siteName}`,
    },
    description: "记录思考，也记录生活。",
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AppChrome />
        <SiteHeader />
        {children}
        <Footer />
      </body>
    </html>
  );
}

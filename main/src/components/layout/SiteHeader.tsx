import { getPublicSettings } from "@/lib/settings";

import { Navbar } from "./Navbar";

export async function SiteHeader() {
  const { siteName } = await getPublicSettings();
  return <Navbar siteName={siteName} />;
}

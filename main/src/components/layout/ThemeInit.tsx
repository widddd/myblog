"use client";

import { useRef } from "react";
import { useServerInsertedHTML } from "next/navigation";

const THEME_INIT_SCRIPT = `
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

export function ThemeInit() {
  const inserted = useRef(false);

  useServerInsertedHTML(() => {
    if (inserted.current) return null;
    inserted.current = true;
    return (
      <script
        id="myblog-theme-init"
        dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
      />
    );
  });

  return null;
}

"use client";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function ThemeToggle() {
  function toggleTheme() {
    const currentTheme: Theme =
      document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const nextTheme: Theme = currentTheme === "dark" ? "light" : "dark";
    localStorage.setItem("myblog-theme", nextTheme);
    applyTheme(nextTheme);
  }

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={toggleTheme}
      aria-label="切换深浅主题"
      title="切换深浅主题"
    >
      <span className="theme-toggle__light" aria-hidden="true">
        ☾
      </span>
      <span className="theme-toggle__dark" aria-hidden="true">
        ☀
      </span>
    </button>
  );
}

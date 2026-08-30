"use client";

export function ScrollDown() {
  return (
    <button
      className="scroll-down"
      type="button"
      aria-label="滚动到内容"
      onClick={() =>
        document.getElementById("home-content")?.scrollIntoView({ behavior: "smooth" })
      }
    >
      ⌄
    </button>
  );
}

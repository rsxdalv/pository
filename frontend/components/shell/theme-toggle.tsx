"use client";

import { useCallback, useEffect, useState } from "react";

export type ThemeChoice = "light" | "dark" | "system";
const ORDER: ThemeChoice[] = ["light", "dark", "system"];
const KEY = "pository_theme";

function apply(choice: ThemeChoice) {
  const dark =
    choice === "dark" ||
    (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

const icons: Record<ThemeChoice, string> = {
  light:
    "M12 3v2m0 14v2M5.6 5.6l1.4 1.4m10 10l1.4 1.4M3 12h2m14 0h2M5.6 18.4L7 17m10-10l1.4-1.4M12 8a4 4 0 100 8 4 4 0 000-8z",
  dark: "M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z",
  system: "M4 5h16v11H4zM8 20h8m-4-4v4",
};

export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>("system");

  useEffect(() => {
    try {
      const s = localStorage.getItem(KEY);
      if (s === "light" || s === "dark" || s === "system") setChoice(s);
    } catch {
      // ignore
    }
  }, []);

  // Follow OS changes while in system mode
  useEffect(() => {
    if (choice !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => apply("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [choice]);

  const cycle = useCallback(() => {
    const next = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length];
    setChoice(next);
    apply(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // ignore
    }
  }, [choice]);

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Theme: ${choice}. Click to change`}
      title={`Theme: ${choice}`}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={icons[choice]} />
      </svg>
    </button>
  );
}

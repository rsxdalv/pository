"use client";

import { useState } from "react";

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
}

export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "-";
  const s = Math.round((now - t) / 1000);
  if (s < 45) return "just now";
  const units: [number, string][] = [
    [60, "second"],
    [3600, "minute"],
    [86400, "hour"],
    [86400 * 30, "day"],
    [86400 * 365, "month"],
    [Infinity, "year"],
  ];
  const divs = [1, 60, 3600, 86400, 86400 * 30, 86400 * 365];
  for (let i = 1; i < units.length; i++) {
    if (s < units[i][0]) {
      const n = Math.max(1, Math.floor(s / divs[i]));
      return `${n} ${units[i][1]}${n === 1 ? "" : "s"} ago`;
    }
  }
  return "-";
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

export function CopyButton({
  text,
  label = "Copy",
  className = "",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className={`shrink-0 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted ${className}`}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

/** Tooltip styling shared by recharts charts (theme-aware). */
export const tooltipStyle = {
  contentStyle: {
    backgroundColor: "hsl(var(--popover))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 6,
    color: "hsl(var(--popover-foreground))",
    fontSize: 12,
  },
  labelStyle: { color: "hsl(var(--popover-foreground))" },
  itemStyle: { color: "hsl(var(--popover-foreground))" },
  cursor: { fill: "hsl(var(--muted))", opacity: 0.6 },
} as const;

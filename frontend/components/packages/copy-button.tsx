"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast";

export function CopyButton({
  text,
  label = "Copy",
  className = "",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: "Copy failed", description: "Clipboard is not available.", variant: "error" });
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label}
      className={`rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring ${className}`}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

export function CodeBlock({ code, label }: { code: string; label: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-muted/50 p-2">
      <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all text-xs text-foreground">
        <code>{code}</code>
      </pre>
      <CopyButton text={code} label="Copy" className="shrink-0" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

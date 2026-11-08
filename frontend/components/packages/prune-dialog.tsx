"use client";

import { useEffect, useRef, useState } from "react";
import { useApiKey } from "@/lib/api-key-context";
import type { PruneResult } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatBytes } from "@/lib/format";

export function PruneDialog({
  onClose,
  onDone,
  name,
  repos,
  initialRepo = "",
}: {
  onClose: () => void;
  onDone: () => void;
  /** When set, offers scoping to this package. */
  name?: string;
  repos: string[];
  initialRepo?: string;
}) {
  const { api } = useApiKey();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [keep, setKeep] = useState(3);
  const [onlyName, setOnlyName] = useState(!!name);
  const [repo, setRepo] = useState(initialRepo);
  const [preview, setPreview] = useState<PruneResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstField.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector('[role="alertdialog"]')) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const req = () => ({
    keepLastN: Math.max(1, Math.floor(keep) || 1),
    ...(onlyName && name ? { name } : {}),
    ...(repo ? { repo } : {}),
  });

  const runPreview = async () => {
    if (!api) return;
    setBusy(true);
    setError(null);
    try {
      setPreview(await api.prunePackages({ ...req(), dryRun: true }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const runPrune = async () => {
    if (!api || !preview) return;
    const ok = await confirm({
      title: `Delete ${preview.deleted.length} old version${preview.deleted.length === 1 ? "" : "s"}?`,
      description: `This permanently removes the listed versions and frees ${formatBytes(preview.freedBytes)}.`,
      confirmLabel: "Delete versions",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await api.prunePackages({ ...req(), dryRun: false });
      toast({
        title: "Cleanup complete",
        description: `Deleted ${res.deleted.length} version${res.deleted.length === 1 ? "" : "s"}, freed ${formatBytes(res.freedBytes)}.`,
        variant: "success",
      });
      onDone();
      onClose();
    } catch (e) {
      toast({ title: "Cleanup failed", description: e instanceof Error ? e.message : String(e), variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  const field = "rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="prune-title"
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-lg border border-border bg-card shadow-xl sm:rounded-lg"
      >
        <div className="border-b border-border p-4">
          <h2 id="prune-title" className="text-lg font-semibold text-foreground">
            Clean up old versions
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Keeps the newest N versions of each package per repo, distribution, component and architecture.
          </p>
        </div>
        <div className="space-y-4 overflow-y-auto p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-muted-foreground">
              Versions to keep
              <input
                ref={firstField}
                type="number"
                min={1}
                value={keep}
                onChange={(e) => {
                  setKeep(Number(e.target.value));
                  setPreview(null);
                }}
                className={`mt-1 w-full ${field}`}
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              Repository
              <select
                value={repo}
                onChange={(e) => {
                  setRepo(e.target.value);
                  setPreview(null);
                }}
                className={`mt-1 w-full ${field}`}
              >
                <option value="">All repositories</option>
                {repos.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {name && (
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={onlyName}
                onChange={(e) => {
                  setOnlyName(e.target.checked);
                  setPreview(null);
                }}
              />
              Only <code className="rounded bg-muted px-1">{name}</code>
            </label>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {preview && (
            <div className="rounded-md border border-border">
              <p className="border-b border-border px-3 py-2 text-sm text-foreground">
                {preview.deleted.length === 0
                  ? "Nothing to delete."
                  : `${preview.deleted.length} version${preview.deleted.length === 1 ? "" : "s"} would be deleted, freeing ${formatBytes(preview.freedBytes)}.`}
              </p>
              {preview.deleted.length > 0 && (
                <ul className="max-h-56 divide-y divide-border overflow-y-auto text-xs">
                  {preview.deleted.map((p) => (
                    <li
                      key={`${p.repo}/${p.distribution}/${p.component}/${p.architecture}/${p.name}/${p.version}`}
                      className="flex items-center justify-between gap-2 px-3 py-1.5"
                    >
                      <span className="min-w-0 truncate text-foreground">
                        {p.name} <code className="text-muted-foreground">{p.version}</code>
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {p.repo}/{p.distribution} · {p.architecture} · {formatBytes(p.size)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-4">
          <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted">
            Cancel
          </button>
          {preview && preview.deleted.length > 0 ? (
            <button
              onClick={runPrune}
              disabled={busy}
              className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              {busy ? "Working..." : `Delete ${preview.deleted.length} version${preview.deleted.length === 1 ? "" : "s"}`}
            </button>
          ) : (
            <button
              onClick={runPreview}
              disabled={busy}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {busy ? "Checking..." : "Preview"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

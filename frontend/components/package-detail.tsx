"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { useApiKey } from "@/lib/api-key-context";
import { aptRepoUrl, PackageMetadata } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatBytes, formatDate, formatRelativeTime } from "@/lib/format";
import { CodeBlock, CopyButton } from "./packages/copy-button";
import { byUploadedDesc, pkgId, useIsAdmin } from "./packages/shared";

const DEP_FIELDS: [keyof PackageMetadata, string][] = [
  ["depends", "Depends"],
  ["preDepends", "Pre-Depends"],
  ["suggests", "Suggests"],
  ["conflicts", "Conflicts"],
  ["breaks", "Breaks"],
  ["replaces", "Replaces"],
  ["provides", "Provides"],
];

function RelationList({ label, value }: { label: string; value: string }) {
  const items = value.split(",").map((s) => s.trim()).filter(Boolean);
  if (items.length === 0) return null;
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 flex flex-wrap gap-1">
        {items.map((it) => (
          <code key={it} className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
            {it}
          </code>
        ))}
      </dd>
    </div>
  );
}

export function PackageDetail({
  name,
  versions,
  onClose,
  onChanged,
  onCleanup,
}: {
  name: string;
  /** All known versions of this package (any repo), newest first not required. */
  versions: PackageMetadata[];
  onClose: () => void;
  onChanged: () => void;
  onCleanup: (name: string) => void;
}) {
  const { api } = useApiKey();
  const { toast } = useToast();
  const confirm = useConfirm();
  const isAdmin = useIsAdmin();
  const panel = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sorted = useMemo(() => [...versions].sort(byUploadedDesc), [versions]);
  const latest = sorted[0];
  const selected = sorted.find((v) => pkgId(v) === selectedId) ?? latest;

  // Enrich with full metadata (list may omit control fields)
  const { data: full } = useSWR(
    latest && api ? ["package-detail", pkgId(latest)] : null,
    () => api!.getPackage(latest),
    { shouldRetryOnError: false, revalidateOnFocus: false }
  );
  const meta: PackageMetadata | undefined = latest ? { ...latest, ...(full ?? {}) } : undefined;

  // Focus management + Escape + focus trap
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // a nested modal (confirm / cleanup dialog) owns Escape
        if (document.querySelectorAll('[aria-modal="true"]').length > 1) return;
        onClose();
      } else if (e.key === "Tab" && panel.current) {
        if (document.querySelectorAll('[aria-modal="true"]').length > 1) return;
        const f = panel.current.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])'
        );
        if (f.length === 0) return;
        const first = f[0];
        const last = f[f.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !panel.current.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !panel.current.contains(active))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);

  const download = async (p: PackageMetadata) => {
    try {
      await api?.downloadPackage(p);
    } catch (e) {
      toast({ title: "Download failed", description: e instanceof Error ? e.message : String(e), variant: "error" });
    }
  };

  const remove = async (p: PackageMetadata) => {
    const ok = await confirm({
      title: `Delete ${p.name} ${p.version}?`,
      description: `${p.repo}/${p.distribution}/${p.component} (${p.architecture}) will be permanently removed.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setBusyId(pkgId(p));
    try {
      await api?.deletePackage(p.repo, p.distribution, p.component, p.architecture, p.name, p.version);
      toast({ title: "Package deleted", description: `${p.name} ${p.version}`, variant: "success" });
      onChanged();
      if (versions.length <= 1) onClose();
    } catch (e) {
      toast({ title: "Delete failed", description: e instanceof Error ? e.message : String(e), variant: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const aptLine = selected
    ? `deb [trusted=yes] ${aptRepoUrl(selected.repo)} ${selected.distribution} ${selected.component}`
    : "";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pkg-detail-title"
        className="flex h-full w-full flex-col overflow-hidden bg-card shadow-xl sm:max-w-2xl sm:border-l sm:border-border"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <h2 id="pkg-detail-title" className="truncate text-xl font-semibold text-foreground">
              {name}
            </h2>
            {meta?.description && <p className="mt-1 text-sm text-muted-foreground">{meta.description.split("\n")[0]}</p>}
          </div>
          <button
            ref={closeBtn}
            onClick={onClose}
            aria-label="Close package details"
            className="rounded-md px-2 py-1 text-xl leading-none text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            ×
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          {!meta ? (
            <div className="space-y-2">
              <p className="text-sm text-foreground">Package not found.</p>
              <p className="text-sm text-muted-foreground">It may have been deleted or is not visible with the current key.</p>
            </div>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Latest version</dt>
                  <dd className="mt-0.5"><code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">{meta.version}</code></dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Maintainer</dt>
                  <dd className="mt-0.5 break-words text-foreground">{meta.maintainer || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Section / Priority</dt>
                  <dd className="mt-0.5 text-foreground">{[meta.section, meta.priority].filter(Boolean).join(" / ") || "—"}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs font-medium text-muted-foreground">Homepage</dt>
                  <dd className="mt-0.5 truncate">
                    {meta.homepage && /^https?:\/\//i.test(meta.homepage) ? (
                      <a href={meta.homepage} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        {meta.homepage}
                      </a>
                    ) : (
                      <span className="text-foreground">{meta.homepage || "—"}</span>
                    )}
                  </dd>
                </div>
              </dl>

              {meta.description && meta.description.includes("\n") && (
                <p className="whitespace-pre-line text-sm text-muted-foreground">{meta.description}</p>
              )}

              {DEP_FIELDS.some(([k]) => meta[k]) && (
                <section>
                  <h3 className="mb-2 text-sm font-medium text-foreground">Relationships</h3>
                  <dl className="space-y-3">
                    {DEP_FIELDS.map(([k, label]) =>
                      meta[k] ? <RelationList key={k} label={label} value={String(meta[k])} /> : null
                    )}
                  </dl>
                </section>
              )}

              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-medium text-foreground">
                    Versions <span className="text-muted-foreground">({sorted.length})</span>
                  </h3>
                  {isAdmin && sorted.length > 1 && (
                    <button
                      onClick={() => onCleanup(name)}
                      className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted"
                    >
                      Clean up old versions
                    </button>
                  )}
                </div>
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="px-2 py-2 font-medium">Version</th>
                        <th className="px-2 py-2 font-medium">Arch</th>
                        <th className="px-2 py-2 font-medium">Repo</th>
                        <th className="px-2 py-2 font-medium">Size</th>
                        <th className="px-2 py-2 font-medium">Uploaded</th>
                        <th className="px-2 py-2 font-medium">SHA256</th>
                        <th className="px-2 py-2 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((v) => {
                        const id = pkgId(v);
                        return (
                          <tr
                            key={id}
                            className={`border-b border-border last:border-0 ${id === pkgId(selected) ? "bg-muted/40" : ""}`}
                          >
                            <td className="px-2 py-2">
                              <button
                                onClick={() => setSelectedId(id)}
                                className="text-left font-mono text-foreground hover:underline"
                                title="Use this version in install commands"
                              >
                                {v.version}
                              </button>
                            </td>
                            <td className="px-2 py-2 text-foreground">{v.architecture}</td>
                            <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">
                              {v.repo}/{v.distribution}/{v.component}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 text-foreground">{formatBytes(v.size)}</td>
                            <td className="whitespace-nowrap px-2 py-2 text-muted-foreground" title={formatDate(v.uploadedAt)}>
                              {formatRelativeTime(v.uploadedAt)}
                            </td>
                            <td className="px-2 py-2">
                              <span className="inline-flex items-center gap-1">
                                <code title={v.sha256} className="text-muted-foreground">{v.sha256.slice(0, 8)}</code>
                                <CopyButton text={v.sha256} label="Copy" className="!px-1.5 !py-0.5" />
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 text-right">
                              <button onClick={() => download(v)} className="rounded px-2 py-1 text-primary hover:bg-primary/10">
                                Download
                              </button>
                              {isAdmin && (
                                <button
                                  onClick={() => remove(v)}
                                  disabled={busyId === id}
                                  className="rounded px-2 py-1 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                                >
                                  {busyId === id ? "Deleting..." : "Delete"}
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-medium text-foreground">Install</h3>
                <p className="text-xs text-muted-foreground">
                  Using {selected.version} from {selected.repo}/{selected.distribution}/{selected.component}. Add to{" "}
                  <code>/etc/apt/sources.list.d/pository.list</code>:
                </p>
                <CodeBlock code={aptLine} label="apt source line" />
                <p className="text-xs text-muted-foreground">Then install the latest version:</p>
                <CodeBlock code={`sudo apt-get update && sudo apt-get install ${name}`} label="install command" />
                <p className="text-xs text-muted-foreground">Or pin this version:</p>
                <CodeBlock code={`sudo apt-get install ${name}=${selected.version}`} label="pinned install command" />
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

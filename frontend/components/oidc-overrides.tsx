"use client";

import { useState } from "react";
import useSWR from "swr";
import { useApiKey } from "@/lib/api-key-context";
import { ApiKeyPrompt } from "./api-key-prompt";

interface OverrideFormState {
  repo: string;
  packages: string; // comma-separated, "*" for wildcard
}

export function OidcOverrides() {
  const { apiKey, api } = useApiKey();
  const [isAdding, setIsAdding] = useState(false);
  const [editingRepo, setEditingRepo] = useState<string | null>(null);
  const [form, setForm] = useState<OverrideFormState>({ repo: "", packages: "" });
  const [deletingRepo, setDeletingRepo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, mutate, error } = useSWR(
    apiKey ? ["oidc-overrides", apiKey] : null,
    () => api?.listOidcOverrides(),
    { refreshInterval: 30000 }
  );

  if (!apiKey) {
    return <ApiKeyPrompt />;
  }

  const isPermissionError = error?.message === "Admin permission required";
  const isAuthError =
    error?.message === "Invalid API key" || error?.message === "Missing API key";

  if (isPermissionError || isAuthError) {
    return (
      <div className="rounded-lg border border-border bg-card p-12 text-center">
        <svg
          className="mx-auto h-12 w-12 text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
        <h3 className="mt-4 text-lg font-semibold text-foreground">
          {isAuthError ? "Invalid API Key" : "Admin Access Required"}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {isAuthError
            ? "The API key you entered was rejected."
            : "You need admin permissions to manage OIDC overrides."}
        </p>
      </div>
    );
  }

  const overrides = data?.overrides ?? {};
  const entries = Object.entries(overrides);

  const startAdd = () => {
    setEditingRepo(null);
    setForm({ repo: "", packages: "" });
    setIsAdding(true);
  };

  const startEdit = (repo: string, packages: string[]) => {
    setEditingRepo(repo);
    setForm({ repo, packages: packages.join(", ") });
    setIsAdding(true);
  };

  const cancelForm = () => {
    setIsAdding(false);
    setEditingRepo(null);
    setForm({ repo: "", packages: "" });
  };

  const handleSave = async () => {
    const repoTrimmed = form.repo.trim();
    if (!repoTrimmed) {
      alert("Repository path is required (e.g. owner/repo-name)");
      return;
    }
    const packages = form.packages
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (packages.length === 0) {
      alert('At least one package name is required (use * for wildcard)');
      return;
    }
    setSaving(true);
    try {
      await api?.upsertOidcOverride(repoTrimmed, packages);
      cancelForm();
      mutate();
    } catch (err) {
      alert(`Failed to save override: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (repo: string) => {
    if (!confirm(`Delete OIDC override for "${repo}"?`)) return;
    setDeletingRepo(repo);
    try {
      await api?.deleteOidcOverride(repo);
      mutate();
    } catch (err) {
      alert(`Failed to delete override: ${err}`);
    } finally {
      setDeletingRepo(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">OIDC Overrides</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Control which GitHub repositories can upload which Debian packages via OIDC (no API key required).
          </p>
        </div>
        <button
          onClick={isAdding ? cancelForm : startAdd}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {isAdding ? "Cancel" : "Add Override"}
        </button>
      </div>

      {/* Info box */}
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground space-y-1">
        <p>
          <span className="font-semibold text-foreground">Default rule:</span> a private repo under an allowed owner can upload a package whose name matches the repo name (e.g. <code className="rounded bg-muted px-1">rsxdalv/my-service</code> → package <code className="rounded bg-muted px-1">my-service</code>).
        </p>
        <p>
          Use overrides to allow a repo to upload <span className="font-semibold text-foreground">multiple packages</span> or to use a <span className="font-semibold text-foreground">wildcard</span> (<code className="rounded bg-muted px-1">*</code>).
        </p>
      </div>

      {/* Add / Edit Form */}
      {isAdding && (
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold text-foreground">
            {editingRepo ? `Edit override for "${editingRepo}"` : "Add Override"}
          </h3>
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                GitHub Repository <span className="text-muted-foreground">(owner/repo-name)</span>
              </label>
              <input
                type="text"
                value={form.repo}
                onChange={(e) => setForm({ ...form, repo: e.target.value })}
                disabled={!!editingRepo}
                placeholder="rsxdalv/mono-repo"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                Allowed Packages{" "}
                <span className="text-muted-foreground">(comma-separated; use * for any)</span>
              </label>
              <input
                type="text"
                value={form.packages}
                onChange={(e) => setForm({ ...form, packages: e.target.value })}
                placeholder="service-a, service-b"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Saving…" : editingRepo ? "Update Override" : "Save Override"}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {entries.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="mt-4 text-lg font-semibold text-foreground">No overrides configured</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            The default convention-over-config rule is active. Add overrides for mono-repos or wildcard access.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  GitHub Repository
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Allowed Packages
                </th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map(([repo, packages]) => (
                <tr key={repo} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-mono text-foreground">{repo}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {packages.map((pkg) => (
                        <span
                          key={pkg}
                          className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
                            pkg === "*"
                              ? "bg-yellow-500/20 text-yellow-400"
                              : "bg-primary/10 text-primary"
                          }`}
                        >
                          {pkg}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => startEdit(repo, packages)}
                        className="rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(repo)}
                        disabled={deletingRepo === repo}
                        className="rounded px-2 py-1 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                      >
                        {deletingRepo === repo ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

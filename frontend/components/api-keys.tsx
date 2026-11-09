"use client";

import { useState } from "react";
import useSWR from "swr";
import { useApiKey } from "@/lib/api-key-context";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ApiKeyPrompt } from "./api-key-prompt";
import { CopyButton, Skeleton, relativeTime } from "./overview/shared";

type Role = "admin" | "write" | "read";

const ROLES: { value: Role; label: string; help: string }[] = [
  { value: "read", label: "Read", help: "Browse packages and metadata; download .debs." },
  { value: "write", label: "Write", help: "Everything in read, plus upload packages." },
  { value: "admin", label: "Admin", help: "Full access: delete packages, manage keys and OIDC overrides." },
];

const ROLE_BADGE: Record<Role, string> = {
  admin: "bg-destructive/10 text-destructive",
  write: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  read: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
};

function RoleBadge({ role }: { role: Role }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGE[role] ?? "bg-muted text-muted-foreground"}`}>{role}</span>;
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-8 text-center sm:p-12">
      <svg className="mx-auto h-12 w-12 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        />
      </svg>
      <h3 className="mt-4 text-lg font-semibold text-foreground">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

export function ApiKeys() {
  const ctx = useApiKey();
  const { apiKey, api } = ctx;
  const role = (ctx as { role?: string | null }).role ?? ctx.ssoUser?.role ?? null;
  const notAdmin = role === "read" || role === "write";
  const { toast } = useToast();
  const confirm = useConfirm();

  const [isCreating, setIsCreating] = useState(false);
  const [newRole, setNewRole] = useState<Role>("read");
  const [description, setDescription] = useState("");
  const [descError, setDescError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ key: string; role: string; description?: string } | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const { data, mutate, error, isLoading } = useSWR(
    apiKey && !notAdmin ? ["keys", apiKey] : null,
    () => api?.listKeys(),
    { refreshInterval: 30000, shouldRetryOnError: false }
  );

  if (!apiKey) return <ApiKeyPrompt />;

  const isAuthError = error?.message === "Invalid API key" || error?.message === "Missing API key";
  const isPermissionError = notAdmin || error?.message === "Admin permission required";

  if (isPermissionError || isAuthError) {
    return (
      <Notice
        title={isAuthError ? "Invalid API key" : "Admin access required"}
        body={
          isAuthError
            ? "The API key you entered was rejected. Sign out and enter a valid key."
            : `Managing API keys needs the admin role${role ? `; you are signed in with ${role} access` : ""}. Ask an administrator to create a key for you or change your role.`
        }
      />
    );
  }

  const keys = data?.keys || [];

  const closeForm = () => {
    setIsCreating(false);
    setDescription("");
    setDescError(null);
    setNewRole("read");
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setDescError("Add a description so you can recognise this key later.");
      return;
    }
    setCreating(true);
    try {
      const result = await api?.createKey(newRole, description.trim());
      if (result) {
        setCreated({ key: result.key, role: result.role, description: result.description });
        closeForm();
        mutate();
      }
    } catch (err) {
      toast({ title: "Failed to create API key", description: err instanceof Error ? err.message : String(err), variant: "error" });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, desc?: string) => {
    const ok = await confirm({
      title: "Delete API key?",
      description: (
        <>
          Anything using <code className="rounded bg-muted px-1">{id}</code>
          {desc ? ` (${desc})` : ""} will immediately lose access. This cannot be undone.
        </>
      ),
      confirmLabel: "Delete key",
      destructive: true,
    });
    if (!ok) return;
    setDeletingKey(id);
    try {
      await api?.deleteKey(id);
      toast({ title: "API key deleted", description: id, variant: "success" });
      mutate();
    } catch (err) {
      toast({ title: "Failed to delete API key", description: err instanceof Error ? err.message : String(err), variant: "error" });
    } finally {
      setDeletingKey(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground">API Keys</h2>
          <p className="mt-1 text-sm text-muted-foreground">Manage authentication keys for the repository</p>
        </div>
        <button
          onClick={() => (isCreating ? closeForm() : setIsCreating(true))}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {isCreating ? "Cancel" : "Create key"}
        </button>
      </div>

      {error && !isAuthError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">Failed to load keys: {error.message}</p>
          <button onClick={() => mutate()} className="rounded-md border border-border bg-background px-3 py-1 text-sm text-foreground hover:bg-muted">
            Retry
          </button>
        </div>
      )}

      {isCreating && (
        <form onSubmit={handleCreate} className="rounded-lg border border-border bg-card p-4 sm:p-6" noValidate>
          <h3 className="mb-4 text-lg font-semibold text-foreground">Create new API key</h3>
          <div className="space-y-5">
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-foreground">Role</legend>
              <div role="radiogroup" className="inline-flex w-full overflow-hidden rounded-md border border-border sm:w-auto">
                {ROLES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    role="radio"
                    aria-checked={newRole === r.value}
                    onClick={() => setNewRole(r.value)}
                    className={`flex-1 px-4 py-2 text-sm font-medium transition-colors sm:flex-none ${
                      newRole === r.value ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-muted"
                    } ${r.value !== "read" ? "border-l border-border" : ""}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                {ROLES.map((r) => (
                  <li key={r.value} className={newRole === r.value ? "text-foreground" : ""}>
                    <span className="font-medium">{r.label}:</span> {r.help}
                  </li>
                ))}
              </ul>
            </fieldset>

            <div>
              <label htmlFor="key-desc" className="mb-2 block text-sm font-medium text-foreground">
                Description
              </label>
              <input
                id="key-desc"
                type="text"
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  if (descError) setDescError(null);
                }}
                aria-invalid={!!descError}
                placeholder="e.g., CI/CD deployment key"
                className={`w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring ${
                  descError ? "border-destructive" : "border-input"
                }`}
              />
              {descError && <p role="alert" className="mt-1 text-sm text-destructive">{descError}</p>}
            </div>

            <button
              type="submit"
              disabled={creating}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {creating ? "Generating…" : "Generate API key"}
            </button>
          </div>
        </form>
      )}

      {created && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="created-title" className="w-full max-w-lg rounded-lg border border-border bg-card p-5 shadow-xl sm:p-6">
            <h3 id="created-title" className="text-lg font-semibold text-foreground">API key created</h3>
            <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
              <span aria-hidden="true">⚠</span>
              <p>
                <strong>Copy this key now — you won&apos;t see it again.</strong> Only a hash is stored on the server.
              </p>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              {created.description ? `${created.description} · ` : ""}role: {created.role}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <code className="min-w-0 flex-1 select-all break-all rounded border border-border bg-muted px-3 py-2 font-mono text-sm text-foreground">
                {created.key}
              </code>
              <CopyButton text={created.key} className="py-2" />
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setCreated(null)}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                I&apos;ve saved it
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : keys.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center sm:p-12">
          <h3 className="text-lg font-semibold text-foreground">No API keys yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">Create a key to let CI pipelines or teammates upload and read packages.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-border">
                  {["ID", "Description", "Role", "Scope", "Created", ""].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => {
                  const repos = key.scope?.repos ?? [];
                  const dists = key.scope?.distributions ?? [];
                  return (
                    <tr key={key.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-3">
                        <code className="rounded bg-muted px-2 py-1 text-xs text-foreground">{key.id}</code>
                      </td>
                      <td className="max-w-[16rem] truncate px-4 py-3 text-sm text-foreground" title={key.description}>
                        {key.description || <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <RoleBadge role={key.role} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {repos.length === 0 && dists.length === 0 ? (
                          "All"
                        ) : (
                          <div className="space-y-0.5">
                            {repos.length > 0 && <div>repos: {repos.join(", ")}</div>}
                            {dists.length > 0 && <div>dists: {dists.join(", ")}</div>}
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground" title={new Date(key.createdAt).toLocaleString()}>
                        {relativeTime(key.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleDelete(key.id, key.description)}
                          disabled={deletingKey === key.id}
                          className="rounded-md px-3 py-1 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                        >
                          {deletingKey === key.id ? "Deleting…" : "Delete"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

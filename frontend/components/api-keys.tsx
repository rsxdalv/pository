"use client";

import { useState } from "react";
import useSWR from "swr";
import { useApiKey } from "@/lib/api-key-context";
import { ApiKeyPrompt } from "./api-key-prompt";

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function ApiKeys() {
  const { apiKey, api } = useApiKey();
  const [isCreating, setIsCreating] = useState(false);
  const [newKey, setNewKey] = useState<{
    role: "admin" | "write" | "read";
    description: string;
  }>({
    role: "read",
    description: "",
  });
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const { data, mutate, error } = useSWR(
    apiKey ? "keys" : null,
    () => api?.listKeys(),
    { refreshInterval: 10000 }
  );

  if (!apiKey) {
    return <ApiKeyPrompt />;
  }

  const keys = data?.keys || [];
  const hasPermission = error?.message !== "Admin permission required";

  const handleCreate = async () => {
    if (!newKey.description.trim()) {
      alert("Please provide a description");
      return;
    }

    try {
      const result = await api?.createKey(newKey.role, newKey.description);
      if (result) {
        setCreatedKey(result.key);
        setNewKey({ role: "read", description: "" });
        mutate();
      }
    } catch (error) {
      alert(`Failed to create API key: ${error}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this API key?")) {
      return;
    }

    setDeletingKey(id);
    try {
      await api?.deleteKey(id);
      mutate();
    } catch (error) {
      alert(`Failed to delete API key: ${error}`);
    } finally {
      setDeletingKey(null);
    }
  };

  if (!hasPermission) {
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
          Admin Access Required
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          You need admin permissions to manage API keys
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">API Keys</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage authentication keys for the repository
          </p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {isCreating ? "Cancel" : "Create Key"}
        </button>
      </div>

      {/* Create Key Form */}
      {isCreating && (
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold text-foreground">
            Create New API Key
          </h3>
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                Role
              </label>
              <select
                value={newKey.role}
                onChange={(e) =>
                  setNewKey({
                    ...newKey,
                    role: e.target.value as "admin" | "write" | "read",
                  })
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="read">Read - View packages and metadata</option>
                <option value="write">Write - Upload packages</option>
                <option value="admin">Admin - Full access</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                Description
              </label>
              <input
                type="text"
                value={newKey.description}
                onChange={(e) =>
                  setNewKey({ ...newKey, description: e.target.value })
                }
                placeholder="e.g., CI/CD deployment key"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <button
              onClick={handleCreate}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Generate API Key
            </button>
          </div>
        </div>
      )}

      {/* Created Key Display */}
      {createdKey && (
        <div className="rounded-lg border border-primary bg-primary/5 p-6">
          <div className="flex items-start gap-3">
            <svg
              className="h-5 w-5 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="flex-1">
              <h4 className="font-semibold text-foreground">API Key Created</h4>
              <p className="mt-1 text-sm text-muted-foreground">
                Store this key securely. It will not be shown again.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 rounded bg-muted px-3 py-2 text-sm text-foreground">
                  {createdKey}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(createdKey);
                    alert("Copied to clipboard");
                  }}
                  className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Copy
                </button>
              </div>
              <button
                onClick={() => setCreatedKey(null)}
                className="mt-3 text-sm text-muted-foreground hover:text-foreground"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keys Table */}
      <div className="rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">
                  ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">
                  Created
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {keys.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <p className="text-sm text-muted-foreground">No API keys found</p>
                  </td>
                </tr>
              ) : (
                keys.map((key) => (
                  <tr
                    key={key.id}
                    className="border-b border-border last:border-0 hover:bg-muted/50"
                  >
                    <td className="px-6 py-4">
                      <code className="rounded bg-muted px-2 py-1 text-xs text-foreground">
                        {key.id}
                      </code>
                    </td>
                    <td className="px-6 py-4 text-sm text-foreground">
                      {key.description || "-"}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          key.role === "admin"
                            ? "bg-destructive/10 text-destructive"
                            : key.role === "write"
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {key.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {formatDate(key.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleDelete(key.id)}
                        disabled={deletingKey === key.id}
                        className="rounded-md px-3 py-1 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                      >
                        {deletingKey === key.id ? "Deleting..." : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

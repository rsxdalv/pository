"use client";

import { useState } from "react";
import useSWR from "swr";
import { useApiKey } from "@/lib/api-key-context";
import { PackageMetadata } from "@/lib/api";
import { ApiKeyPrompt } from "./api-key-prompt";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

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

/** Group packages by name (across all repos/distributions). */
function groupPackages(packages: PackageMetadata[]): Map<string, PackageMetadata[]> {
  const groups = new Map<string, PackageMetadata[]>();
  for (const pkg of packages) {
    const key = pkg.name;
    const list = groups.get(key) ?? [];
    list.push(pkg);
    groups.set(key, list);
  }
  // Sort versions within each group (newest first by uploadedAt)
  for (const [, list] of groups) {
    list.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  }
  return groups;
}

export function Packages() {
  const { apiKey, api } = useApiKey();
  const [filters, setFilters] = useState({
    repo: "",
    distribution: "",
    component: "",
    architecture: "",
    name: "",
  });
  const [deletingPackage, setDeletingPackage] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const { data, mutate } = useSWR(
    apiKey ? ["packages-list", apiKey, filters] : null,
    () =>
      api?.listPackages(
        Object.fromEntries(
          Object.entries(filters).filter(([, v]) => v !== "")
        )
      ),
    { refreshInterval: 5000 }
  );

  if (!apiKey) {
    return <ApiKeyPrompt />;
  }

  const packages = data?.packages || [];

  // Get unique values for filters
  const repos = Array.from(new Set(packages.map((p) => p.repo)));
  const distributions = Array.from(new Set(packages.map((p) => p.distribution)));
  const components = Array.from(new Set(packages.map((p) => p.component)));
  const architectures = Array.from(new Set(packages.map((p) => p.architecture)));

  const grouped = groupPackages(packages);

  const toggleGroup = (name: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleDelete = async (pkg: PackageMetadata) => {
    if (!confirm(`Are you sure you want to delete ${pkg.name} ${pkg.version}?`)) {
      return;
    }

    const pkgId = `${pkg.repo}/${pkg.distribution}/${pkg.component}/${pkg.architecture}/${pkg.name}/${pkg.version}`;
    setDeletingPackage(pkgId);

    try {
      await api?.deletePackage(
        pkg.repo,
        pkg.distribution,
        pkg.component,
        pkg.architecture,
        pkg.name,
        pkg.version
      );
      mutate();
    } catch (error) {
      alert(`Failed to delete package: ${error}`);
    } finally {
      setDeletingPackage(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Packages</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your Debian packages
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          {grouped.size} package{grouped.size !== 1 ? "s" : ""} &middot; {packages.length} version{packages.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h3 className="mb-4 text-sm font-medium text-foreground">Filters</h3>
        <div className="grid gap-4 md:grid-cols-5">
          <div>
            <label className="mb-2 block text-xs text-muted-foreground">
              Repository
            </label>
            <select
              value={filters.repo}
              onChange={(e) => setFilters({ ...filters, repo: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All</option>
              {repos.map((repo) => (
                <option key={repo} value={repo}>
                  {repo}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-xs text-muted-foreground">
              Distribution
            </label>
            <select
              value={filters.distribution}
              onChange={(e) =>
                setFilters({ ...filters, distribution: e.target.value })
              }
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All</option>
              {distributions.map((dist) => (
                <option key={dist} value={dist}>
                  {dist}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-xs text-muted-foreground">
              Component
            </label>
            <select
              value={filters.component}
              onChange={(e) =>
                setFilters({ ...filters, component: e.target.value })
              }
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All</option>
              {components.map((comp) => (
                <option key={comp} value={comp}>
                  {comp}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-xs text-muted-foreground">
              Architecture
            </label>
            <select
              value={filters.architecture}
              onChange={(e) =>
                setFilters({ ...filters, architecture: e.target.value })
              }
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All</option>
              {architectures.map((arch) => (
                <option key={arch} value={arch}>
                  {arch}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-xs text-muted-foreground">
              Package Name
            </label>
            <input
              type="text"
              value={filters.name}
              onChange={(e) => setFilters({ ...filters, name: e.target.value })}
              placeholder="Search..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      </div>

      {/* Packages Table */}
      <div className="rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">
                  Package
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">
                  Latest Version
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">
                  Architecture
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">
                  Repository
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">
                  Size
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">
                  Uploaded
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {grouped.size === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <p className="text-sm text-muted-foreground">
                      No packages found
                    </p>
                  </td>
                </tr>
              ) : (
                Array.from(grouped.entries()).map(([name, versions]) => {
                  const latest = versions[0];
                  const hasMultiple = versions.length > 1;
                  const isExpanded = expandedGroups.has(name);
                  const latestId = `${latest.repo}/${latest.distribution}/${latest.component}/${latest.architecture}/${latest.name}/${latest.version}`;

                  return (
                    <>
                      {/* Group header row — latest version */}
                      <tr
                        key={`group-${name}`}
                        className="border-b border-border hover:bg-muted/50"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {hasMultiple && (
                              <button
                                onClick={() => toggleGroup(name)}
                                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground focus:outline-none"
                                title={isExpanded ? "Collapse versions" : `Show ${versions.length} versions`}
                              >
                                <svg
                                  className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2.5}
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                </svg>
                              </button>
                            )}
                            {!hasMultiple && <span className="w-5" />}
                            <div>
                              <p className="font-medium text-foreground">{latest.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {latest.distribution}/{latest.component}
                                {hasMultiple && (
                                  <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-xs">
                                    {versions.length} versions
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <code className="rounded bg-muted px-2 py-1 text-xs text-foreground">
                            {latest.version}
                          </code>
                        </td>
                        <td className="px-6 py-4">
                          <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                            {latest.architecture}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-foreground">
                          {latest.repo}
                        </td>
                        <td className="px-6 py-4 text-sm text-foreground">
                          {formatBytes(latest.size)}
                        </td>
                        <td className="px-6 py-4 text-sm text-muted-foreground">
                          {formatDate(latest.uploadedAt)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleDelete(latest)}
                            disabled={deletingPackage === latestId}
                            className="rounded-md px-3 py-1 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                          >
                            {deletingPackage === latestId ? "Deleting..." : "Delete"}
                          </button>
                        </td>
                      </tr>

                      {/* Older versions (expanded) */}
                      {isExpanded &&
                        versions.slice(1).map((pkg) => {
                          const pkgId = `${pkg.repo}/${pkg.distribution}/${pkg.component}/${pkg.architecture}/${pkg.name}/${pkg.version}`;
                          return (
                            <tr
                              key={pkgId}
                              className="border-b border-border bg-muted/20 last:border-0 hover:bg-muted/40"
                            >
                              <td className="px-6 py-3 pl-12">
                                <p className="text-sm text-muted-foreground">{pkg.name}</p>
                              </td>
                              <td className="px-6 py-3">
                                <code className="rounded bg-muted px-2 py-1 text-xs text-foreground">
                                  {pkg.version}
                                </code>
                              </td>
                              <td className="px-6 py-3">
                                <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                                  {pkg.architecture}
                                </span>
                              </td>
                              <td className="px-6 py-3 text-sm text-foreground">
                                {pkg.repo}
                              </td>
                              <td className="px-6 py-3 text-sm text-foreground">
                                {formatBytes(pkg.size)}
                              </td>
                              <td className="px-6 py-3 text-sm text-muted-foreground">
                                {formatDate(pkg.uploadedAt)}
                              </td>
                              <td className="px-6 py-3 text-right">
                                <button
                                  onClick={() => handleDelete(pkg)}
                                  disabled={deletingPackage === pkgId}
                                  className="rounded-md px-3 py-1 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                                >
                                  {deletingPackage === pkgId ? "Deleting..." : "Delete"}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

"use client";

import useSWR from "swr";
import { useApiKey } from "@/lib/api-key-context";
import { parseMetrics } from "@/lib/api";
import { ApiKeyPrompt } from "./api-key-prompt";
import { MetricsChart } from "./metrics-chart";
import { StorageChart } from "./storage-chart";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

export function Overview() {
  const { apiKey, api } = useApiKey();

  const { data: packagesData, error: packagesError } = useSWR(
    apiKey ? ["packages", apiKey] : null,
    () => api?.listPackages(),
    { refreshInterval: 5000 }
  );

  const { data: metricsText } = useSWR(
    apiKey ? ["metrics", apiKey] : null,
    () => api?.getMetrics(),
    { refreshInterval: 5000 }
  );

  const { data: readiness } = useSWR(
    apiKey ? ["readiness", apiKey] : null,
    () => api?.getReadiness(),
    { refreshInterval: 10000 }
  );

  if (!apiKey) {
    return <ApiKeyPrompt />;
  }

  if (packagesError) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
        <p className="font-medium text-destructive">Failed to load data</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {packagesError.message || "Check that your API key is valid and has at least read access."}
        </p>
      </div>
    );
  }

  const packages = packagesData?.packages || [];
  const metrics = metricsText ? parseMetrics(metricsText) : null;

  // Calculate storage stats
  const totalSize = packages.reduce((sum, pkg) => sum + pkg.size, 0);
  const packageCount = packages.length;

  // Group packages by repo
  const repoStats = packages.reduce(
    (acc, pkg) => {
      if (!acc[pkg.repo]) {
        acc[pkg.repo] = { count: 0, size: 0 };
      }
      acc[pkg.repo].count++;
      acc[pkg.repo].size += pkg.size;
      return acc;
    },
    {} as Record<string, { count: number; size: number }>
  );

  // Group packages by architecture
  const archStats = packages.reduce(
    (acc, pkg) => {
      acc[pkg.architecture] = (acc[pkg.architecture] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="space-y-6">
      {/* Status Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">Total Packages</p>
            <svg
              className="h-4 w-4 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
              />
            </svg>
          </div>
          <p className="mt-2 text-3xl font-bold text-foreground">{packageCount}</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">Storage Used</p>
            <svg
              className="h-4 w-4 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
              />
            </svg>
          </div>
          <p className="mt-2 text-3xl font-bold text-foreground">
            {formatBytes(totalSize)}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">Requests</p>
            <svg
              className="h-4 w-4 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
              />
            </svg>
          </div>
          <p className="mt-2 text-3xl font-bold text-foreground">
            {metrics?.requestsTotal || 0}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">System Status</p>
            <div
              className={`h-2 w-2 rounded-full ${
                readiness?.status === "ready" ? "bg-green-500" : "bg-red-500"
              }`}
            />
          </div>
          <p className="mt-2 text-3xl font-bold text-foreground">
            {readiness?.status === "ready" ? "Healthy" : "Offline"}
          </p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold text-foreground">
            Request Metrics
          </h3>
          {metrics && <MetricsChart metrics={metrics} />}
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold text-foreground">
            Storage by Repository
          </h3>
          {Object.keys(repoStats).length > 0 && <StorageChart data={repoStats} />}
        </div>
      </div>

      {/* Repository Stats */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-6">
          <h3 className="text-lg font-semibold text-foreground">
            Repository Statistics
          </h3>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            {Object.entries(repoStats).map(([repo, stats]) => (
              <div key={repo} className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">{repo}</p>
                  <p className="text-sm text-muted-foreground">
                    {stats.count} packages
                  </p>
                </div>
                <p className="text-sm font-medium text-foreground">
                  {formatBytes(stats.size)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Architecture Distribution */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-6">
          <h3 className="text-lg font-semibold text-foreground">
            Architecture Distribution
          </h3>
        </div>
        <div className="p-6">
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
            {Object.entries(archStats).map(([arch, count]) => (
              <div
                key={arch}
                className="rounded-lg border border-border bg-muted p-4"
              >
                <p className="text-sm text-muted-foreground">{arch}</p>
                <p className="mt-1 text-2xl font-bold text-foreground">{count}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { ReactNode } from "react";
import useSWR from "swr";
import { useApiKey } from "@/lib/api-key-context";
import { parseMetrics, PackageMetadata } from "@/lib/api";
import { ApiKeyPrompt } from "./api-key-prompt";
import { MetricsChart } from "./metrics-chart";
import { StorageChart } from "./storage-chart";
import { UploadsChart } from "./overview/uploads-chart";
import { GettingStarted } from "./overview/getting-started";
import { Skeleton, formatBytes, relativeTime } from "./overview/shared";

function Card({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="min-w-0 rounded-lg border border-border bg-card p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-foreground sm:text-lg">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function StatCard({ label, value, extra }: { label: string; value: ReactNode; extra?: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {extra}
      </div>
      <p className="mt-2 truncate text-2xl font-bold text-foreground sm:text-3xl">{value}</p>
    </div>
  );
}

function RecentUploads({ items }: { items: PackageMetadata[] }) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No packages uploaded yet.</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {items.map((p) => (
        <li key={`${p.repo}/${p.distribution}/${p.component}/${p.architecture}/${p.name}/${p.version}`}>
          <a
            href={`?tab=packages&pkg=${encodeURIComponent(p.name)}`}
            className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 hover:bg-muted"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {p.name} <span className="font-mono text-xs text-muted-foreground">{p.version}</span>
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {p.repo}/{p.distribution} · {p.architecture} · {formatBytes(p.size)}
              </p>
            </div>
            <time dateTime={p.uploadedAt} title={new Date(p.uploadedAt).toLocaleString()} className="shrink-0 text-xs text-muted-foreground">
              {relativeTime(p.uploadedAt)}
            </time>
          </a>
        </li>
      ))}
    </ul>
  );
}

function ArchBreakdown({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No data yet.</p>;
  }
  const max = Math.max(...entries.map(([, c]) => c), 1);
  return (
    <ul className="space-y-3">
      {entries.map(([arch, count]) => (
        <li key={arch}>
          <div className="mb-1 flex justify-between text-sm">
            <span className="font-medium text-foreground">{arch}</span>
            <span className="text-muted-foreground">{count}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: `${(count / max) * 100}%`, backgroundColor: "hsl(var(--chart-3))" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading overview">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-72" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}

export function Overview() {
  const { apiKey, api } = useApiKey();

  const { data: stats, error: statsError, isLoading, mutate } = useSWR(
    apiKey ? ["stats", apiKey] : null,
    () => api?.getStats(),
    { refreshInterval: 30000 }
  );
  const { data: metricsText } = useSWR(apiKey ? ["metrics", apiKey] : null, () => api?.getMetrics(), {
    refreshInterval: 30000,
  });
  const { data: readiness, error: readinessError } = useSWR(
    apiKey ? ["readiness", apiKey] : null,
    () => api?.getReadiness(),
    { refreshInterval: 15000 }
  );

  if (!apiKey) return <ApiKeyPrompt />;

  if (statsError && !stats) {
    return (
      <div role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
        <p className="font-medium text-destructive">Failed to load statistics</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {statsError.message || "Check that your credentials are valid and have at least read access."}
        </p>
        <button
          onClick={() => mutate()}
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!stats || isLoading) return <LoadingState />;

  const metrics = metricsText ? parseMetrics(metricsText) : null;
  const healthy = !readinessError && readiness?.status === "ready";
  const healthKnown = readiness !== undefined || !!readinessError;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Packages" value={stats.packageCount.toLocaleString()} />
        <StatCard label="Versions" value={stats.versionCount.toLocaleString()} />
        <StatCard label="Storage used" value={formatBytes(stats.totalSize)} />
        <StatCard
          label="Service health"
          value={!healthKnown ? "Checking…" : healthy ? "Healthy" : "Unavailable"}
          extra={
            <span
              role="img"
              aria-label={healthy ? "healthy" : "unhealthy"}
              className={`h-2.5 w-2.5 rounded-full ${
                !healthKnown ? "bg-muted-foreground/40" : healthy ? "bg-emerald-500" : "bg-destructive"
              }`}
            />
          }
        />
      </div>

      <Card title="Uploads — last 30 days">
        <UploadsChart data={stats.uploadsByDay} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Storage by repository">
          <StorageChart data={stats.byRepo} />
        </Card>
        <Card title="Versions by architecture">
          <ArchBreakdown data={stats.byArchitecture} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Recent uploads">
          <RecentUploads items={stats.recentUploads} />
        </Card>
        <Card title="Request metrics">
          {metrics ? <MetricsChart metrics={metrics} /> : <Skeleton className="h-56" />}
        </Card>
      </div>

      <Card title="Getting started">
        <GettingStarted />
      </Card>
    </div>
  );
}

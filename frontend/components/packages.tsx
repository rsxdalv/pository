"use client";

import { Fragment, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { useApiKey } from "@/lib/api-key-context";
import { API_URL, PackageMetadata } from "@/lib/api";
import { formatBytes, formatDate, formatRelativeTime } from "@/lib/format";
import { ApiKeyPrompt } from "./api-key-prompt";
import { PackageDetail } from "./package-detail";
import { PruneDialog } from "./packages/prune-dialog";
import { CodeBlock } from "./packages/copy-button";
import { byUploadedDesc, compareVersions, useIsAdmin } from "./packages/shared";

type SortKey = "name" | "version" | "size" | "uploaded";
interface Group {
  name: string;
  versions: PackageMetadata[]; // newest first
  latest: PackageMetadata;
}

const selectCls =
  "rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

function groupPackages(packages: PackageMetadata[]): Group[] {
  const map = new Map<string, PackageMetadata[]>();
  for (const p of packages) {
    const l = map.get(p.name);
    if (l) l.push(p);
    else map.set(p.name, [p]);
  }
  return [...map.entries()].map(([name, versions]) => {
    versions.sort(byUploadedDesc);
    return { name, versions, latest: versions[0] };
  });
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function SortHeader({
  label,
  k,
  sort,
  onSort,
  className = "",
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === k;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={`px-4 py-3 text-left text-xs font-medium text-muted-foreground ${className}`}
    >
      <button
        onClick={() => onSort(k)}
        className="inline-flex items-center gap-1 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {label}
        <span aria-hidden className={active ? "text-foreground" : "opacity-30"}>
          {active ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
}

function Skeleton() {
  return (
    <div className="divide-y divide-border" aria-busy="true" aria-label="Loading packages">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
          </div>
          <div className="hidden h-4 w-20 animate-pulse rounded bg-muted md:block" />
          <div className="hidden h-4 w-16 animate-pulse rounded bg-muted md:block" />
          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function PackagesInner() {
  const { apiKey, api } = useApiKey();
  const isAdmin = useIsAdmin();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const openName = searchParams.get("pkg");

  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [repo, setRepo] = useState("");
  const [distribution, setDistribution] = useState("");
  const [architecture, setArchitecture] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "uploaded", dir: "desc" });
  const [prune, setPrune] = useState<{ name?: string } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim().toLowerCase()), 150);
    return () => clearTimeout(t);
  }, [search]);

  const { data, error, isLoading, mutate } = useSWR(
    apiKey && api ? ["packages-list", apiKey] : null,
    () => api!.listPackages(),
    { refreshInterval: 30000, revalidateOnFocus: true }
  );

  const all = useMemo(() => data?.packages ?? [], [data]);

  // Filter options come from the unfiltered list
  const repos = useMemo(() => uniq(all.map((p) => p.repo)), [all]);
  const distributions = useMemo(() => uniq(all.map((p) => p.distribution)), [all]);
  const architectures = useMemo(() => uniq(all.map((p) => p.architecture)), [all]);

  const filtered = useMemo(
    () =>
      all.filter(
        (p) =>
          (!repo || p.repo === repo) &&
          (!distribution || p.distribution === distribution) &&
          (!architecture || p.architecture === architecture) &&
          (!query ||
            p.name.toLowerCase().includes(query) ||
            p.version.toLowerCase().includes(query) ||
            (p.description ?? "").toLowerCase().includes(query) ||
            (p.maintainer ?? "").toLowerCase().includes(query))
      ),
    [all, repo, distribution, architecture, query]
  );

  const groups = useMemo(() => {
    const g = groupPackages(filtered);
    const m = sort.dir === "asc" ? 1 : -1;
    g.sort((a, b) => {
      let c = 0;
      switch (sort.key) {
        case "name":
          c = a.name.localeCompare(b.name);
          break;
        case "version":
          c = compareVersions(a.latest.version, b.latest.version);
          break;
        case "size":
          c = a.latest.size - b.latest.size;
          break;
        case "uploaded":
          c = -byUploadedDesc(a.latest, b.latest);
          break;
      }
      return c * m || a.name.localeCompare(b.name);
    });
    return g;
  }, [filtered, sort]);

  const filtersActive = !!(search || repo || distribution || architecture);
  const clearFilters = () => {
    setSearch("");
    setQuery("");
    setRepo("");
    setDistribution("");
    setArchitecture("");
  };

  const onSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));

  const setPkgParam = useCallback(
    (name: string | null) => {
      const params = new URLSearchParams(window.location.search);
      if (name) params.set("pkg", name);
      else params.delete("pkg");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname]
  );
  const closeDetail = useCallback(() => setPkgParam(null), [setPkgParam]);

  if (!apiKey) return <ApiKeyPrompt />;

  const openVersions = openName ? all.filter((p) => p.name === openName) : [];
  const showDrawer = !!openName && !isLoading && (openVersions.length > 0 || !!data);

  const hasData = all.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Packages</h2>
          <p className="mt-1 text-sm text-muted-foreground">Browse, download and manage Debian packages</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setPrune({})}
            className="rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
          >
            Clean up old versions
          </button>
        )}
      </div>

      {/* Search + filters */}
      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="relative">
          <input
            id="global-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, description, maintainer or version  (press / to focus)"
            aria-label="Search packages"
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={repo} onChange={(e) => setRepo(e.target.value)} aria-label="Repository" className={selectCls}>
            <option value="">All repos</option>
            {repos.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <select value={distribution} onChange={(e) => setDistribution(e.target.value)} aria-label="Distribution" className={selectCls}>
            <option value="">All distributions</option>
            {distributions.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <select value={architecture} onChange={(e) => setArchitecture(e.target.value)} aria-label="Architecture" className={selectCls}>
            <option value="">All architectures</option>
            {architectures.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          {filtersActive && (
            <button onClick={clearFilters} className="rounded-md px-2 py-1.5 text-sm text-primary hover:underline">
              Clear filters
            </button>
          )}
          <span className="ml-auto text-sm text-muted-foreground" aria-live="polite">
            {groups.length} package{groups.length !== 1 ? "s" : ""} &middot; {filtered.length} version{filtered.length !== 1 ? "s" : ""}
            {filtersActive && hasData ? ` of ${all.length}` : ""}
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {isLoading && !data ? (
          <Skeleton />
        ) : error && !data ? (
          <div role="alert" className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-destructive">Failed to load packages</p>
            <p className="mt-1 text-sm text-muted-foreground">{error instanceof Error ? error.message : String(error)}</p>
            <button
              onClick={() => mutate()}
              className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Retry
            </button>
          </div>
        ) : !hasData ? (
          <div className="mx-auto max-w-xl space-y-3 px-6 py-12">
            <p className="text-center text-sm font-medium text-foreground">No packages yet</p>
            <p className="text-center text-sm text-muted-foreground">Upload your first .deb with the API:</p>
            <CodeBlock
              label="upload command"
              code={`curl -H "X-Api-Key: $KEY" -F "file=@pkg.deb" -F repo=default -F distribution=stable ${API_URL}/api/v1/packages`}
            />
          </div>
        ) : groups.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-foreground">No packages match your filters</p>
            <button onClick={clearFilters} className="mt-3 text-sm text-primary hover:underline">
              Clear filters
            </button>
          </div>
        ) : (
          <>
            {/* Wide: table */}
            <table className="hidden w-full table-fixed md:table">
              <thead>
                <tr className="border-b border-border">
                  <SortHeader label="Package" k="name" sort={sort} onSort={onSort} className="w-[40%]" />
                  <SortHeader label="Latest version" k="version" sort={sort} onSort={onSort} className="w-[18%]" />
                  <th scope="col" className="hidden px-4 py-3 text-left text-xs font-medium text-muted-foreground lg:table-cell lg:w-[14%]">
                    Repo
                  </th>
                  <SortHeader label="Size" k="size" sort={sort} onSort={onSort} className="w-[12%]" />
                  <SortHeader label="Uploaded" k="uploaded" sort={sort} onSort={onSort} className="w-[14%]" />
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <Fragment key={g.name}>
                    <tr
                      onClick={() => setPkgParam(g.name)}
                      className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50"
                    >
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPkgParam(g.name);
                          }}
                          className="block max-w-full truncate text-left font-medium text-foreground hover:underline focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          {g.name}
                        </button>
                        {g.latest.description && (
                          <p className="truncate text-xs text-muted-foreground">{g.latest.description.split("\n")[0]}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <code className="rounded bg-muted px-2 py-1 text-xs text-foreground">{g.latest.version}</code>
                        {g.versions.length > 1 && (
                          <span className="ml-2 text-xs text-muted-foreground">+{g.versions.length - 1}</span>
                        )}
                      </td>
                      <td className="hidden truncate px-4 py-3 text-sm text-foreground lg:table-cell">
                        {g.latest.repo}
                        <span className="text-muted-foreground">/{g.latest.distribution}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">{formatBytes(g.latest.size)}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground" title={formatDate(g.latest.uploadedAt)}>
                        {formatRelativeTime(g.latest.uploadedAt)}
                      </td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>

            {/* Narrow: cards */}
            <ul className="divide-y divide-border md:hidden">
              {groups.map((g) => (
                <li key={g.name}>
                  <button
                    onClick={() => setPkgParam(g.name)}
                    className="block w-full px-4 py-3 text-left hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-medium text-foreground">{g.name}</span>
                      <code className="shrink-0 rounded bg-muted px-2 py-0.5 text-xs text-foreground">{g.latest.version}</code>
                    </div>
                    {g.latest.description && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{g.latest.description.split("\n")[0]}</p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {g.latest.repo}/{g.latest.distribution} &middot; {formatBytes(g.latest.size)} &middot;{" "}
                      <span title={formatDate(g.latest.uploadedAt)}>{formatRelativeTime(g.latest.uploadedAt)}</span>
                      {g.versions.length > 1 && <> &middot; {g.versions.length} versions</>}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {showDrawer && openName && (
        <PackageDetail
          name={openName}
          versions={openVersions}
          onClose={closeDetail}
          onChanged={() => mutate()}
          onCleanup={(n) => setPrune({ name: n })}
        />
      )}
      {prune && (
        <PruneDialog
          name={prune.name}
          repos={repos}
          onClose={() => setPrune(null)}
          onDone={() => mutate()}
        />
      )}
    </div>
  );
}

export function Packages() {
  return (
    <Suspense fallback={null}>
      <PackagesInner />
    </Suspense>
  );
}

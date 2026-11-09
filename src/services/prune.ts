import { PackageMetadata } from "./storage.js";
import { compareDebianVersions } from "./debian-version.js";

export interface PrunePolicy {
  /** Keep the newest N versions per group. */
  keepLastN?: number;
  /** When set, only versions older than this many days (and beyond keep) are deleted. */
  maxAgeDays?: number;
}

export function groupKey(p: PackageMetadata): string {
  return [p.repo, p.distribution, p.component, p.architecture, p.name].join("\u0000");
}

/** Group packages by repo/distribution/component/architecture/name, newest version first. */
export function groupPackages(packages: PackageMetadata[]): PackageMetadata[][] {
  const groups = new Map<string, PackageMetadata[]>();
  for (const p of packages) {
    const key = groupKey(p);
    const g = groups.get(key);
    if (g) g.push(p);
    else groups.set(key, [p]);
  }
  for (const g of groups.values()) {
    g.sort((a, b) => compareDebianVersions(b.version, a.version));
  }
  return Array.from(groups.values());
}

/**
 * Decide which packages to delete. Packages are grouped, ordered newest-first
 * by Debian version, and everything beyond the policy's keep count (and older
 * than maxAgeDays, if set) is returned. `protect` versions are never returned.
 *
 * If only maxAgeDays is set, at least one version per group is kept.
 */
export function selectPrunable(
  packages: PackageMetadata[],
  policy: PrunePolicy,
  opts: { protect?: (p: PackageMetadata) => boolean; now?: number } = {}
): PackageMetadata[] {
  const keep = policy.keepLastN ?? (policy.maxAgeDays != null ? 1 : undefined);
  if (keep === undefined) return [];

  const now = opts.now ?? Date.now();
  const cutoff = policy.maxAgeDays != null ? now - policy.maxAgeDays * 86_400_000 : undefined;

  const result: PackageMetadata[] = [];
  for (const group of groupPackages(packages)) {
    group.slice(keep).forEach((p) => {
      if (opts.protect?.(p)) return;
      if (cutoff !== undefined && !(Date.parse(p.uploadedAt) < cutoff)) return;
      result.push(p);
    });
  }
  return result;
}

import { useApiKey } from "@/lib/api-key-context";
import type { PackageMetadata } from "@/lib/api";

export function pkgId(p: PackageMetadata): string {
  return `${p.repo}/${p.distribution}/${p.component}/${p.architecture}/${p.name}/${p.version}`;
}

/** Role-aware helper; role === null means unknown (show admin actions, backend enforces). */
export function useIsAdmin(): boolean {
  const ctx = useApiKey();
  const role = (ctx as { role?: string | null }).role ?? ctx.ssoUser?.role ?? null;
  return role === null || role === "admin";
}

export function byUploadedDesc(a: PackageMetadata, b: PackageMetadata): number {
  return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
}

/** Natural-ish version comparison for sorting. */
export function compareVersions(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

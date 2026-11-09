/**
 * What to do when an upload targets a repo/distribution/component/arch/name/version that already exists.
 *
 * Production history shows many repos re-upload the same version on every push to their default branch,
 * so overwriting stays allowed there. What must not happen is a build from a PR or feature branch silently
 * replacing a version that is already published (and possibly deployed).
 *
 * - "allow":          any upload may replace an existing version (pre-0.6 behaviour)
 * - "default-branch": (default) OIDC uploads may replace a version only from `overwriteAllowedRefs`;
 *                     API-key uploads carry no ref and may replace (scope those keys via CI instead)
 * - "reject":         published versions are immutable; a changed re-upload is always refused
 *
 * Re-uploading byte-identical content is always accepted as a no-op.
 */
export type OverwritePolicy = "allow" | "default-branch" | "reject";

export const DEFAULT_OVERWRITE_ALLOWED_REFS = ["refs/heads/main", "refs/heads/master"];

export type OverwriteDecision = "store" | "unchanged" | "conflict";

export function decideOverwrite(opts: {
  existingSha256?: string;
  newSha256: string;
  policy?: OverwritePolicy;
  oidcRef?: string;
  allowedRefs?: string[];
}): OverwriteDecision {
  const { existingSha256, newSha256, oidcRef } = opts;
  if (!existingSha256) return "store";
  if (existingSha256 === newSha256) return "unchanged";
  const policy = opts.policy ?? "default-branch";
  if (policy === "allow") return "store";
  if (policy === "reject") return "conflict";
  if (oidcRef === undefined) return "store"; // API key: no ref information
  const allowed = opts.allowedRefs ?? DEFAULT_OVERWRITE_ALLOWED_REFS;
  return allowed.includes(oidcRef) ? "store" : "conflict";
}

export function isOverwritePolicy(v: unknown): v is OverwritePolicy {
  return v === "allow" || v === "default-branch" || v === "reject";
}

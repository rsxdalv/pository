import { Config } from "../config.js";

/**
 * Authorization logic for GitHub OIDC-authenticated uploads.
 *
 * Convention by default, explicit override by exception:
 *   - Default rule: the GitHub repo name must match the Debian package name.
 *     e.g. repo "rsxdalv/gh-stats-tts-webui" → can upload package "gh-stats-tts-webui"
 *   - Overrides (oidcOverrides in config):
 *     "rsxdalv/mono-repo": ["service-a", "service-b"]  → multiple packages from one repo
 *     "rsxdalv/deployment-bot": ["*"]                  → can upload anything
 *
 * This means zero config for the happy path — a new repo automatically and
 * only gets to upload its own same-name package.
 */

export interface OidcAuthzResult {
  allowed: boolean;
  reason?: string;
}

export function isOidcAllowed(
  claims: {
    repository: string;
    repository_visibility: string;
    event_name: string;
  },
  packageName: string,
  config: Config,
  dynamicOverrides?: Record<string, string[]>
): OidcAuthzResult {
  // Always block pull_request events (fork PRs could abuse uploads)
  if (claims.event_name === "pull_request") {
    return { allowed: false, reason: "pull_request events are not permitted" };
  }

  const { repository, repository_visibility } = claims;

  // Check explicit overrides first — dynamic overrides (API-managed) take precedence over config
  const overrides = { ...(config.oidcOverrides ?? {}), ...(dynamicOverrides ?? {}) };
  const overridePackages = overrides[repository];
  if (overridePackages) {
    if (overridePackages.includes("*") || overridePackages.includes(packageName)) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `Repository "${repository}" has an override but it does not include package "${packageName}"`,
    };
  }

  // Default rule: owner must be in allowed owners list
  const [owner, repoName] = repository.split("/");
  const allowedOwners = config.oidcAllowedOwners ?? ["rsxdalv"];
  if (!allowedOwners.includes(owner)) {
    return {
      allowed: false,
      reason: `Owner "${owner}" is not in oidcAllowedOwners; add an oidcOverride to permit this repository`,
    };
  }

  // If requirePrivate is true (default), check that the repo is private
  const requirePrivate = config.oidcRequirePrivate ?? true;
  if (requirePrivate && repository_visibility !== "private") {
    return {
      allowed: false,
      reason: `Visibility "${repository_visibility}" is not "private" (oidcRequirePrivate is enabled); add an oidcOverride to allow public/internal repos`,
    };
  }

  // Default convention: package name must be repoName plus one of the allowed suffixes
  const allowedSuffixes: string[] = config.oidcAllowedSuffixes ?? [""];
  const nameMatches = allowedSuffixes.some((suffix: string) => packageName === repoName + suffix);
  if (!nameMatches) {
    const suffixNote =
      allowedSuffixes.length === 1 && allowedSuffixes[0] === ""
        ? `the package name must equal the repo name`
        : `the package name must be the repo name plus one of: ${allowedSuffixes.map((s: string) => `"${s || "(none)"}"` ).join(", ")}`;
    return {
      allowed: false,
      reason: `Default rule: "${packageName}" does not match repo "${repoName}" (${suffixNote}); add an oidcOverride or configure oidcAllowedSuffixes`,
    };
  }

  return { allowed: true };
}

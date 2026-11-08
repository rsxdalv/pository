export interface PackageMetadata {
  name: string;
  version: string;
  architecture: string;
  size: number;
  sha256: string;
  mime: string;
  uploadedAt: string;
  uploaderKeyId: string;
  repo: string;
  distribution: string;
  component: string;
  md5?: string;
  // Control-file fields (present for most packages)
  description?: string;
  maintainer?: string;
  depends?: string;
  preDepends?: string;
  suggests?: string;
  conflicts?: string;
  breaks?: string;
  replaces?: string;
  provides?: string;
  homepage?: string;
  section?: string;
  priority?: string;
  multiArch?: string;
  installedSize?: number;
}

/** GET /api/v1/info (read role) */
export interface ServerInfo {
  version: string;
  allowedRepos: string[];
  maxUploadSize: number;
  retention: { enabled: boolean; keepLastN?: number; maxAgeDays?: number };
}

/** GET /api/v1/stats (read role) */
export interface RepoStats {
  totalSize: number;
  versionCount: number;
  packageCount: number; // distinct package names
  byRepo: Record<string, { count: number; size: number }>;
  byArchitecture: Record<string, number>;
  uploadsByDay: { date: string; count: number; size: number }[]; // last 30 days, oldest first, zero-filled
  recentUploads: PackageMetadata[]; // newest first, max 10
}

/** POST /api/v1/packages/prune (admin role) */
export interface PruneRequest {
  keepLastN: number; // >= 1, versions kept per repo/dist/component/arch/name
  name?: string;
  repo?: string;
  distribution?: string;
  dryRun?: boolean;
}
export interface PruneResult {
  dryRun: boolean;
  deleted: PackageMetadata[];
  freedBytes: number;
}

export interface StorageStats {
  totalSize: number;
  packageCount: number;
}

export interface HealthCheck {
  status: string;
  checks?: {
    storage: boolean;
  };
}

export interface ApiKeyInfo {
  id: string;
  role: "admin" | "write" | "read";
  description?: string;
  createdAt: string;
  scope?: {
    repos?: string[];
    distributions?: string[];
  };
}

export interface Metrics {
  requestsTotal: number;
  requestsByMethod: Record<string, number>;
  requestsByStatus: Record<number, number>;
  errorsTotal: number;
  uploadBytes: number;
  downloadBytes: number;
  avgLatency: number;
}

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3222";

/** Public base URL for apt clients of a given repo, e.g. https://host/apt/default */
export function aptRepoUrl(repo: string): string {
  return `${API_URL.replace(/\/$/, "")}/apt/${repo}`;
}

export class PositoryAPI {
  private apiKey: string | null;
  private baseUrl: string;

  // apiKey=null + baseUrl="/sso" talks to the Authelia-protected proxy path (cookie auth, no key)
  constructor(apiKey: string | null, baseUrl: string = API_URL) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  private async fetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      credentials: this.apiKey ? options.credentials : "same-origin",
      headers: {
        ...(this.apiKey ? { "X-Api-Key": this.apiKey } : {}),
        // Only declare JSON when there is a body: Fastify rejects an empty body with a JSON content-type
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }

    if (res.status === 204) return undefined as T;
    return res.json();
  }

  async listPackages(filters?: {
    repo?: string;
    distribution?: string;
    component?: string;
    architecture?: string;
    name?: string;
    version?: string;
  }): Promise<{ packages: PackageMetadata[] }> {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
    }
    const query = params.toString();
    return this.fetch(`/api/v1/packages${query ? `?${query}` : ""}`);
  }

  async deletePackage(
    repo: string,
    distribution: string,
    component: string,
    architecture: string,
    name: string,
    version: string
  ): Promise<void> {
    await this.fetch(
      `/api/v1/packages/${PositoryAPI.packagePath({ repo, distribution, component, architecture, name, version })}`,
      { method: "DELETE" }
    );
  }

  /** Path of a package (shared by metadata, delete, download). */
  static packagePath(pkg: Pick<PackageMetadata, "repo" | "distribution" | "component" | "architecture" | "name" | "version">): string {
    return [pkg.repo, pkg.distribution, pkg.component, pkg.architecture, pkg.name, pkg.version]
      .map(encodeURIComponent)
      .join("/");
  }

  async getPackage(pkg: Pick<PackageMetadata, "repo" | "distribution" | "component" | "architecture" | "name" | "version">): Promise<PackageMetadata> {
    return this.fetch(`/api/v1/packages/${PositoryAPI.packagePath(pkg)}`);
  }

  /**
   * Browser download of a .deb. Uses fetch (so API-key and SSO cookie auth both work),
   * then saves the blob via a temporary object URL.
   */
  async downloadPackage(pkg: PackageMetadata): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/v1/packages/${PositoryAPI.packagePath(pkg)}/download`, {
      credentials: this.apiKey ? undefined : "same-origin",
      headers: this.apiKey ? { "X-Api-Key": this.apiKey } : {},
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${pkg.name}_${pkg.version}_${pkg.architecture}.deb`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async getInfo(): Promise<ServerInfo> {
    return this.fetch("/api/v1/info");
  }

  async getStats(): Promise<RepoStats> {
    return this.fetch("/api/v1/stats");
  }

  async prunePackages(req: PruneRequest): Promise<PruneResult> {
    return this.fetch("/api/v1/packages/prune", {
      method: "POST",
      body: JSON.stringify(req),
    });
  }

  async getHealth(): Promise<HealthCheck> {
    const res = await fetch(`${API_URL}/healthz`);
    return res.json();
  }

  async getReadiness(): Promise<HealthCheck> {
    const res = await fetch(`${API_URL}/readyz`);
    return res.json();
  }

  async getMetrics(): Promise<string> {
    const res = await fetch(`${API_URL}/metrics`);
    return res.text();
  }

  async listKeys(): Promise<{ keys: ApiKeyInfo[] }> {
    return this.fetch("/api/v1/keys");
  }

  async createKey(
    role: "admin" | "write" | "read",
    description?: string
  ): Promise<{ id: string; key: string; role: string; description?: string }> {
    return this.fetch("/api/v1/keys", {
      method: "POST",
      body: JSON.stringify({ role, description }),
    });
  }

  async deleteKey(id: string): Promise<void> {
    await this.fetch(`/api/v1/keys/${id}`, { method: "DELETE" });
  }

  async listOidcOverrides(): Promise<{ overrides: Record<string, string[]> }> {
    return this.fetch("/api/v1/oidc-overrides");
  }

  async upsertOidcOverride(repo: string, packages: string[]): Promise<void> {
    await this.fetch(`/api/v1/oidc-overrides/${repo}`, {
      method: "PUT",
      body: JSON.stringify({ packages }),
    });
  }

  async deleteOidcOverride(repo: string): Promise<void> {
    await this.fetch(`/api/v1/oidc-overrides/${repo}`, { method: "DELETE" });
  }
}

export function parseMetrics(metricsText: string): Metrics {
  const lines = metricsText.split("\n");
  const metrics: Metrics = {
    requestsTotal: 0,
    requestsByMethod: {},
    requestsByStatus: {},
    errorsTotal: 0,
    uploadBytes: 0,
    downloadBytes: 0,
    avgLatency: 0,
  };

  for (const line of lines) {
    if (line.startsWith("#") || !line.trim()) continue;

    if (line.startsWith("pository_requests_total ")) {
      metrics.requestsTotal = parseFloat(line.split(" ")[1]);
    } else if (line.startsWith("pository_errors_total ")) {
      metrics.errorsTotal = parseFloat(line.split(" ")[1]);
    } else if (line.startsWith("pository_upload_bytes_total ")) {
      metrics.uploadBytes = parseFloat(line.split(" ")[1]);
    } else if (line.startsWith("pository_download_bytes_total ")) {
      metrics.downloadBytes = parseFloat(line.split(" ")[1]);
    } else if (line.startsWith("pository_request_latency_ms_avg ")) {
      const v = parseFloat(line.split(" ")[1]);
      metrics.avgLatency = Number.isFinite(v) ? v : 0;
    } else if (line.includes('pository_requests_by_method{method="')) {
      const match = line.match(/method="([^"]+)"\} (\d+)/);
      if (match) {
        metrics.requestsByMethod[match[1]] = parseFloat(match[2]);
      }
    } else if (line.includes('pository_requests_by_status{status="')) {
      const match = line.match(/status="([^"]+)"\} (\d+)/);
      if (match) {
        metrics.requestsByStatus[parseInt(match[1], 10)] = parseFloat(match[2]);
      }
    }
  }

  return metrics;
}

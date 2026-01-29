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

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export class PositoryAPI {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async fetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        "X-Api-Key": this.apiKey,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }

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
      `/api/v1/packages/${repo}/${distribution}/${component}/${architecture}/${name}/${version}`,
      { method: "DELETE" }
    );
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
      metrics.avgLatency = parseFloat(line.split(" ")[1]);
    } else if (line.includes('pository_requests_by_method{method="')) {
      const match = line.match(/method="([^"]+)"\} (\d+)/);
      if (match) {
        metrics.requestsByMethod[match[1]] = parseFloat(match[2]);
      }
    } else if (line.includes('pository_requests_by_status{status="')) {
      const match = line.match(/status="([^"]+)"\} (\d+)/);
      if (match) {
        metrics.requestsByStatus[match[1]] = parseFloat(match[2]);
      }
    }
  }

  return metrics;
}

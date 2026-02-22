import { FastifyInstance } from "fastify";
import { StorageService } from "../services/storage.js";

interface Metrics {
  requestsTotal: number;
  requestsByMethod: Record<string, number>;
  requestsByStatus: Record<number, number>;
  errorsTotal: number;
  uploadBytes: number;
  downloadBytes: number;
  latencySum: number;
  latencyCount: number;
}

const metrics: Metrics = {
  requestsTotal: 0,
  requestsByMethod: {},
  requestsByStatus: {},
  errorsTotal: 0,
  uploadBytes: 0,
  downloadBytes: 0,
  latencySum: 0,
  latencyCount: 0,
};

export function trackRequest(
  method: string,
  statusCode: number,
  latencyMs: number,
  bytes?: number,
  isUpload?: boolean
): void {
  metrics.requestsTotal++;
  metrics.requestsByMethod[method] = (metrics.requestsByMethod[method] || 0) + 1;
  metrics.requestsByStatus[statusCode] = (metrics.requestsByStatus[statusCode] || 0) + 1;

  if (Number.isFinite(latencyMs)) {
    metrics.latencySum += latencyMs;
    metrics.latencyCount++;
  }

  if (statusCode >= 400) {
    metrics.errorsTotal++;
  }

  if (bytes) {
    if (isUpload) {
      metrics.uploadBytes += bytes;
    } else {
      metrics.downloadBytes += bytes;
    }
  }
}

export function registerHealthRoutes(
  app: FastifyInstance,
  storage: StorageService
): void {
  // Liveness probe
  app.get("/healthz", async (_request, reply) => {
    reply.send({ status: "ok" });
  });

  // Readiness probe
  app.get("/readyz", async (_request, reply) => {
    const storageReady = storage.isStorageReady();

    if (!storageReady) {
      reply.code(503).send({
        status: "not ready",
        checks: {
          storage: false,
        },
      });
      return;
    }

    reply.send({
      status: "ready",
      checks: {
        storage: true,
      },
    });
  });

  // Prometheus metrics endpoint
  app.get("/metrics", async (_request, reply) => {
    const storageStats = storage.getStorageStats();

    const lines: string[] = [];

    // Request metrics
    lines.push("# HELP pository_requests_total Total number of requests");
    lines.push("# TYPE pository_requests_total counter");
    lines.push(`pository_requests_total ${metrics.requestsTotal}`);

    lines.push("# HELP pository_requests_by_method Requests by HTTP method");
    lines.push("# TYPE pository_requests_by_method counter");
    for (const [method, count] of Object.entries(metrics.requestsByMethod)) {
      lines.push(`pository_requests_by_method{method="${method}"} ${count}`);
    }

    lines.push("# HELP pository_requests_by_status Requests by status code");
    lines.push("# TYPE pository_requests_by_status counter");
    for (const [status, count] of Object.entries(metrics.requestsByStatus)) {
      lines.push(`pository_requests_by_status{status="${status}"} ${count}`);
    }

    lines.push("# HELP pository_errors_total Total number of errors");
    lines.push("# TYPE pository_errors_total counter");
    lines.push(`pository_errors_total ${metrics.errorsTotal}`);

    // Throughput metrics
    lines.push("# HELP pository_upload_bytes_total Total bytes uploaded");
    lines.push("# TYPE pository_upload_bytes_total counter");
    lines.push(`pository_upload_bytes_total ${metrics.uploadBytes}`);

    lines.push("# HELP pository_download_bytes_total Total bytes downloaded");
    lines.push("# TYPE pository_download_bytes_total counter");
    lines.push(`pository_download_bytes_total ${metrics.downloadBytes}`);

    // Latency metrics
    lines.push("# HELP pository_request_latency_ms_avg Average request latency");
    lines.push("# TYPE pository_request_latency_ms_avg gauge");
    const avgLatency =
      metrics.latencyCount > 0 ? metrics.latencySum / metrics.latencyCount : 0;
    lines.push(`pository_request_latency_ms_avg ${avgLatency.toFixed(2)}`);

    // Storage metrics
    lines.push("# HELP pository_storage_bytes_total Total storage used");
    lines.push("# TYPE pository_storage_bytes_total gauge");
    lines.push(`pository_storage_bytes_total ${storageStats.totalSize}`);

    lines.push("# HELP pository_packages_total Total number of packages");
    lines.push("# TYPE pository_packages_total gauge");
    lines.push(`pository_packages_total ${storageStats.packageCount}`);

    reply.header("Content-Type", "text/plain; version=0.0.4");
    reply.send(lines.join("\n") + "\n");
  });
}

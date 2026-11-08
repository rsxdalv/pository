import { FastifyInstance } from "fastify";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { StorageService, PackageMetadata } from "../services/storage.js";
import { ApiKeyService } from "../services/api-keys.js";
import { selectPrunable } from "../services/prune.js";
import { Logger } from "../utils/logger.js";
import { Config } from "../config.js";

function readVersion(): string {
  for (const rel of ["../../package.json", "../package.json"]) {
    try {
      const pkg = JSON.parse(fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf-8")) as {
        name?: string;
        version?: string;
      };
      if (pkg.version) return pkg.version;
    } catch { /* try next */ }
  }
  return "unknown";
}

interface PruneBody {
  keepLastN?: unknown;
  name?: string;
  repo?: string;
  distribution?: string;
  dryRun?: boolean;
}

export function registerManagementRoutes(
  app: FastifyInstance,
  storage: StorageService,
  apiKeyService: ApiKeyService,
  logger: Logger,
  config: Config
): void {
  const version = readVersion();

  const requireRole = (role: "read" | "admin") =>
    async (
      request: import("fastify").FastifyRequest,
      reply: import("fastify").FastifyReply
    ) => {
      if (!request.apiKey) {
        reply.code(401).send({ error: "Authentication required" });
        return;
      }
      if (!apiKeyService.hasPermission(request.apiKey, role)) {
        reply.code(403).send({ error: `${role === "read" ? "Read" : "Admin"} permission required` });
        return;
      }
    };

  app.get("/api/v1/info", { preHandler: requireRole("read") }, async (_request, reply) => {
    const retention: { enabled: boolean; keepLastN?: number; maxAgeDays?: number } = {
      enabled: !!config.retention?.enabled,
    };
    if (config.retention?.keepLastN != null) retention.keepLastN = config.retention.keepLastN;
    if (config.retention?.maxAgeDays != null) retention.maxAgeDays = config.retention.maxAgeDays;

    reply.send({
      version,
      allowedRepos: config.allowedRepos,
      maxUploadSize: config.maxUploadSize,
      retention,
    });
  });

  app.get("/api/v1/stats", { preHandler: requireRole("read") }, async (_request, reply) => {
    reply.send(storage.getStats());
  });

  app.post<{ Body: PruneBody }>(
    "/api/v1/packages/prune",
    { preHandler: requireRole("admin") },
    async (request, reply) => {
      const body = (request.body ?? {}) as PruneBody;
      const keepLastN = body.keepLastN;
      if (typeof keepLastN !== "number" || !Number.isInteger(keepLastN) || keepLastN < 1) {
        reply.code(400).send({ error: "keepLastN must be an integer >= 1" });
        return;
      }
      for (const f of ["name", "repo", "distribution"] as const) {
        if (body[f] !== undefined && typeof body[f] !== "string") {
          reply.code(400).send({ error: `${f} must be a string` });
          return;
        }
      }
      const dryRun = body.dryRun === true;
      const apiKey = request.apiKey!;

      const candidates = storage
        .listPackages({ repo: body.repo, distribution: body.distribution })
        .filter((p) => !body.name || p.name === body.name)
        .filter((p) => apiKeyService.hasPermission(apiKey, "admin", p.repo, p.distribution));

      const victims = selectPrunable(candidates, { keepLastN });
      const deleted: PackageMetadata[] = [];
      let freedBytes = 0;

      for (const v of victims) {
        if (!dryRun) {
          if (!storage.deletePackage(v)) continue;
          logger.access({
            action: "delete",
            keyId: apiKey.id,
            ip: request.ip,
            path: `${v.repo}/${v.distribution}/${v.component}/${v.architecture}/${v.name}/${v.version}`,
            reason: "prune",
          });
        }
        deleted.push(v);
        freedBytes += v.size;
      }

      reply.send({ dryRun, deleted, freedBytes });
    }
  );
}

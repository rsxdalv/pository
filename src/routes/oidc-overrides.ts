import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { OidcOverridesService } from "../services/oidc-overrides.js";
import { ApiKeyService } from "../services/api-keys.js";
import { Logger } from "../utils/logger.js";

export function registerOidcOverridesRoutes(
  app: FastifyInstance,
  overridesService: OidcOverridesService,
  apiKeyService: ApiKeyService,
  logger: Logger
): void {
  const adminGuard = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.apiKey) {
      reply.code(401).send({ error: "Authentication required" });
      return;
    }
    if (!apiKeyService.hasPermission(request.apiKey, "admin")) {
      reply.code(403).send({ error: "Admin permission required" });
      return;
    }
  };

  // GET /api/v1/oidc-overrides — list all overrides
  app.get("/api/v1/oidc-overrides", { preHandler: adminGuard }, async () => {
    return { overrides: overridesService.getAll() };
  });

  // PUT /api/v1/oidc-overrides/* — upsert a repo override
  // The wildcard captures the full repo path including slashes (e.g. owner/repo-name)
  app.put<{ Body: { packages: string[] } }>(
    "/api/v1/oidc-overrides/*",
    { preHandler: adminGuard },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const repo = (request.params as { "*": string })["*"];
      const body = request.body as { packages?: unknown };
      if (!repo) {
        return reply.code(400).send({ error: "Repository path is required" });
      }
      if (!Array.isArray(body?.packages) || body.packages.some((p) => typeof p !== "string")) {
        return reply.code(400).send({ error: "packages must be an array of strings" });
      }
      const packages: string[] = body.packages as string[];
      await overridesService.upsert(repo, packages);
      logger.info("OIDC override upserted", { repo, packages, by: request.apiKey!.id });
      return { repo, packages };
    }
  );

  // DELETE /api/v1/oidc-overrides/* — remove a repo override
  app.delete(
    "/api/v1/oidc-overrides/*",
    { preHandler: adminGuard },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const repo = (request.params as { "*": string })["*"];
      if (!repo) {
        return reply.code(400).send({ error: "Repository path is required" });
      }
      await overridesService.remove(repo);
      logger.info("OIDC override removed", { repo, by: request.apiKey!.id });
      return { success: true };
    }
  );
}

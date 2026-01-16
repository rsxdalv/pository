import { FastifyRequest, FastifyReply } from "fastify";
import { ApiKeyService, ApiKeyData, ApiKeyRole } from "../services/api-keys.js";

declare module "fastify" {
  interface FastifyRequest {
    apiKey?: ApiKeyData;
  }
  // Note: FastifyInstance.apiKeyService is decorated in index.ts
}

export function createAuthMiddleware(apiKeyService: ApiKeyService) {
  return async function authMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const apiKey = request.headers["x-api-key"];

    if (!apiKey || typeof apiKey !== "string") {
      reply.code(401).send({ error: "Missing API key" });
      return;
    }

    const keyData = await apiKeyService.validateKey(apiKey);
    if (!keyData) {
      reply.code(401).send({ error: "Invalid API key" });
      return;
    }

    request.apiKey = keyData;
  };
}

export function requireRole(
  apiKeyService: ApiKeyService,
  role: ApiKeyRole,
  repo?: string,
  distribution?: string
) {
  return function (
    request: FastifyRequest,
    reply: FastifyReply
  ): void {
    const apiKey = request.apiKey;
    if (!apiKey) {
      reply.code(401).send({ error: "Authentication required" });
      return;
    }

    if (!apiKeyService.hasPermission(apiKey, role, repo, distribution)) {
      reply.code(403).send({ error: "Insufficient permissions" });
      return;
    }
  };
}

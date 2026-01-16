import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from "fastify";
import { ApiKeyService, ApiKeyData, ApiKeyRole } from "../services/api-keys.js";

declare module "fastify" {
  interface FastifyRequest {
    apiKey?: ApiKeyData;
  }
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

export function requireRole(role: ApiKeyRole, repo?: string, distribution?: string) {
  return function (
    request: FastifyRequest,
    reply: FastifyReply,
    done: HookHandlerDoneFunction
  ): void {
    const apiKey = request.apiKey;
    if (!apiKey) {
      reply.code(401).send({ error: "Authentication required" });
      return done();
    }

    const apiKeyService = (request.server as unknown as { apiKeyService: ApiKeyService })
      .apiKeyService;

    if (!apiKeyService.hasPermission(apiKey, role, repo, distribution)) {
      reply.code(403).send({ error: "Insufficient permissions" });
      return done();
    }

    done();
  };
}

export function optionalAuth(apiKeyService: ApiKeyService) {
  return async function (
    request: FastifyRequest,
    _reply: FastifyReply
  ): Promise<void> {
    const apiKey = request.headers["x-api-key"];

    if (apiKey && typeof apiKey === "string") {
      const keyData = await apiKeyService.validateKey(apiKey);
      if (keyData) {
        request.apiKey = keyData;
      }
    }
  };
}

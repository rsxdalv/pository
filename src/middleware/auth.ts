import { FastifyRequest, FastifyReply } from "fastify";
import { ApiKeyService, ApiKeyData, ApiKeyRole } from "../services/api-keys.js";
import { verifyGitHubOIDC, GitHubOidcClaims } from "./oidc-auth.js";
import { Config } from "../config.js";

declare module "fastify" {
  interface FastifyRequest {
    apiKey?: ApiKeyData;
    oidcClaims?: GitHubOidcClaims;
  }
  // Note: FastifyInstance.apiKeyService is decorated in index.ts
}

export function createAuthMiddleware(apiKeyService: ApiKeyService, config: Config) {
  return async function authMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    // Try OIDC Bearer token first
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const audience = config.oidcAudience ?? "pository";
      try {
        request.oidcClaims = await verifyGitHubOIDC(token, audience);
        return; // authenticated via OIDC
      } catch (err) {
        reply.code(401).send({
          error: "Invalid or expired OIDC token",
          detail: (err as Error).message,
        });
        return;
      }
    }

    // Fall back to API key
    const apiKey = request.headers["x-api-key"];
    if (!apiKey || typeof apiKey !== "string") {
      reply.code(401).send({ error: "Missing authentication: provide X-Api-Key or Authorization: Bearer <oidc-token>" });
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

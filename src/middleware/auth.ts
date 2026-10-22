import { FastifyRequest, FastifyReply } from "fastify";
import { ApiKeyService, ApiKeyData, ApiKeyRole } from "../services/api-keys.js";
import { verifyGitHubOIDC, GitHubOidcClaims } from "./oidc-auth.js";
import { Config } from "../config.js";
import crypto from "node:crypto";

export interface SsoIdentity {
  user: string;
  name?: string;
  groups: string[];
}

declare module "fastify" {
  interface FastifyRequest {
    apiKey?: ApiKeyData;
    oidcClaims?: GitHubOidcClaims;
    ssoIdentity?: SsoIdentity;
  }
  // Note: FastifyInstance.apiKeyService is decorated in index.ts
}

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function headerValue(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

/**
 * Resolve an Authelia identity forwarded by the trusted reverse proxy.
 * Returns undefined unless SSO is enabled AND the shared secret matches.
 */
export function resolveSsoRole(config: Config, groups: string[]): ApiKeyRole | undefined {
  if (groups.some((g) => (config.ssoAdminGroups ?? ["admins"]).includes(g))) return "admin";
  if (groups.some((g) => (config.ssoWriteGroups ?? []).includes(g))) return "write";
  const def = config.ssoDefaultRole ?? "read";
  return def === "none" ? undefined : def;
}

export function authenticateSso(request: FastifyRequest, config: Config): ApiKeyData | undefined {
  if (!config.ssoSecret) return undefined;
  const provided = headerValue(request.headers["x-pository-sso-secret"]);
  if (!provided || !safeEqual(provided, config.ssoSecret)) return undefined;

  const user = headerValue(request.headers["remote-user"]).trim();
  if (!user) return undefined;
  const groups = headerValue(request.headers["remote-groups"])
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);
  const role = resolveSsoRole(config, groups);
  if (!role) return undefined;

  request.ssoIdentity = {
    user,
    name: headerValue(request.headers["remote-name"]) || undefined,
    groups,
  };
  return {
    id: `sso:${user}`,
    hash: "",
    role,
    createdAt: new Date(0).toISOString(),
    description: "Authelia SSO session",
  };
}

export function createAuthMiddleware(apiKeyService: ApiKeyService, config: Config) {
  return async function authMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    // Trusted-proxy Authelia SSO (requires matching shared secret from nginx)
    const sso = authenticateSso(request, config);
    if (sso) {
      request.apiKey = sso;
      return;
    }

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

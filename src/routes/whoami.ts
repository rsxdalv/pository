import { FastifyInstance } from "fastify";

/**
 * GET /api/v1/whoami — describes the authenticated caller. The dashboard uses it to detect
 * an Authelia SSO session and skip the API-key prompt.
 */
export function registerWhoamiRoutes(app: FastifyInstance): void {
  app.get("/api/v1/whoami", async (request, reply) => {
    if (!request.apiKey && !request.oidcClaims) {
      reply.code(401).send({ error: "Authentication required" });
      return;
    }
    if (request.ssoIdentity) {
      reply.send({
        authType: "sso",
        user: request.ssoIdentity.user,
        name: request.ssoIdentity.name,
        groups: request.ssoIdentity.groups,
        role: request.apiKey!.role,
      });
      return;
    }
    if (request.oidcClaims) {
      reply.send({ authType: "oidc", user: request.oidcClaims.repository });
      return;
    }
    reply.send({ authType: "apikey", user: request.apiKey!.id, role: request.apiKey!.role });
  });
}

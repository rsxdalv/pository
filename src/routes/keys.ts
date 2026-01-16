import { FastifyInstance } from "fastify";
import { ApiKeyService, ApiKeyRole, ApiKeyScope } from "../services/api-keys.js";
import { Logger } from "../utils/logger.js";

interface CreateKeyBody {
  role: ApiKeyRole;
  description?: string;
  scope?: ApiKeyScope;
}

interface KeyParams {
  id: string;
}

export function registerKeyRoutes(
  app: FastifyInstance,
  apiKeyService: ApiKeyService,
  logger: Logger
): void {
  // Create API key (admin only)
  app.post<{ Body: CreateKeyBody }>(
    "/api/v1/keys",
    {
      preHandler: async (request, reply) => {
        if (!request.apiKey) {
          reply.code(401).send({ error: "Authentication required" });
          return;
        }
        if (!apiKeyService.hasPermission(request.apiKey, "admin")) {
          reply.code(403).send({ error: "Admin permission required" });
          return;
        }
      },
    },
    async (request, reply) => {
      const { role, description, scope } = request.body;

      if (!role || !["admin", "write", "read"].includes(role)) {
        reply.code(400).send({ error: "Invalid role" });
        return;
      }

      try {
        const { id, key } = await apiKeyService.createKey(role, description, scope);

        logger.info("API key created", {
          keyId: id,
          role,
          createdBy: request.apiKey!.id,
        });

        reply.code(201).send({
          id,
          key,
          role,
          description,
          scope,
          message:
            "Store this key securely. It will not be shown again.",
        });
      } catch (error) {
        logger.error("Failed to create API key", { error: String(error) });
        reply.code(500).send({ error: "Failed to create API key" });
      }
    }
  );

  // List API keys (admin only)
  app.get(
    "/api/v1/keys",
    {
      preHandler: async (request, reply) => {
        if (!request.apiKey) {
          reply.code(401).send({ error: "Authentication required" });
          return;
        }
        if (!apiKeyService.hasPermission(request.apiKey, "admin")) {
          reply.code(403).send({ error: "Admin permission required" });
          return;
        }
      },
    },
    async (_request, reply) => {
      const keys = apiKeyService.listKeys();
      reply.send({ keys });
    }
  );

  // Delete API key (admin only)
  app.delete<{ Params: KeyParams }>(
    "/api/v1/keys/:id",
    {
      preHandler: async (request, reply) => {
        if (!request.apiKey) {
          reply.code(401).send({ error: "Authentication required" });
          return;
        }
        if (!apiKeyService.hasPermission(request.apiKey, "admin")) {
          reply.code(403).send({ error: "Admin permission required" });
          return;
        }
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const deleted = apiKeyService.deleteKey(id);
      if (!deleted) {
        reply.code(404).send({ error: "API key not found" });
        return;
      }

      logger.info("API key deleted", {
        keyId: id,
        deletedBy: request.apiKey!.id,
      });

      reply.code(204).send();
    }
  );
}

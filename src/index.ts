import Fastify from "fastify";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { loadConfig } from "./utils/config-loader.js";
import { Logger } from "./utils/logger.js";
import { ApiKeyService } from "./services/api-keys.js";
import { StorageService } from "./services/storage.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { registerPackageRoutes } from "./routes/packages.js";
import { registerKeyRoutes } from "./routes/keys.js";
import { registerHealthRoutes, trackRequest } from "./routes/health.js";
import fs from "node:fs";

async function main() {
  const configPath = process.argv[2];
  const config = loadConfig(configPath);
  const logger = new Logger(config.logPath);

  logger.info("Starting pository", { config: { ...config, adminKey: "***" } });

  // Initialize services
  const apiKeyService = new ApiKeyService(config.apiKeysPath, config.adminKey);
  const storage = new StorageService(config.dataRoot);

  // Create Fastify instance
  const fastifyOpts: Record<string, unknown> = {
    logger: false, // We use our own logger
    bodyLimit: config.maxUploadSize,
  };

  // Configure TLS if enabled
  if (config.tls.enabled && config.tls.cert && config.tls.key) {
    fastifyOpts.https = {
      cert: fs.readFileSync(config.tls.cert),
      key: fs.readFileSync(config.tls.key),
    };
    logger.info("TLS enabled");
  }

  const app = Fastify(fastifyOpts);

  // Register rate limiting
  await app.register(rateLimit, {
    max: 100, // 100 requests per minute
    timeWindow: "1 minute",
    keyGenerator: (request) => {
      // Use API key ID if authenticated, otherwise use IP
      return request.apiKey?.id || request.ip;
    },
  });

  // Register multipart support
  await app.register(multipart, {
    limits: {
      fileSize: config.maxUploadSize,
    },
  });

  // Decorate app with services for route handlers
  app.decorate("apiKeyService", apiKeyService);

  // Request timing and metrics
  app.addHook("onRequest", async (request, _reply) => {
    (request as unknown as { startTime: number }).startTime = Date.now();
  });

  app.addHook("onResponse", async (request, reply) => {
    const startTime = (request as unknown as { startTime: number }).startTime;
    const latency = Date.now() - startTime;
    trackRequest(request.method, reply.statusCode, latency);

    logger.info("request", {
      method: request.method,
      url: request.url,
      status: reply.statusCode,
      latency,
      ip: request.ip,
      keyId: request.apiKey?.id,
    });
  });

  // Register auth middleware for API routes
  const authMiddleware = createAuthMiddleware(apiKeyService);
  app.addHook("preHandler", async (request, reply) => {
    // Skip auth for health endpoints
    if (
      request.url === "/healthz" ||
      request.url === "/readyz" ||
      request.url === "/metrics"
    ) {
      return;
    }

    await authMiddleware(request, reply);
  });

  // Register routes
  registerHealthRoutes(app, storage);
  registerPackageRoutes(app, storage, apiKeyService, logger, config);
  registerKeyRoutes(app, apiKeyService, logger);

  // Start server
  try {
    await app.listen({ port: config.port, host: config.bindAddress });
    logger.info(`Server listening on ${config.bindAddress}:${config.port}`);
  } catch (err) {
    logger.error("Failed to start server", { error: String(err) });
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down...");
    await app.close();
    logger.close();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

import Fastify from "fastify";
import multipart from "@fastify/multipart";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { loadConfig } from "./utils/config-loader.js";
import { Logger } from "./utils/logger.js";
import { ApiKeyService } from "./services/api-keys.js";
import { StorageService } from "./services/storage.js";
import { OidcOverridesService } from "./services/oidc-overrides.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { registerWhoamiRoutes } from "./routes/whoami.js";
import { registerPackageRoutes } from "./routes/packages.js";
import { registerKeyRoutes } from "./routes/keys.js";
import { registerHealthRoutes, trackRequest } from "./routes/health.js";
import { registerAptRoutes } from "./routes/apt.js";
import { registerManagementRoutes } from "./routes/management.js";
import { registerOidcOverridesRoutes } from "./routes/oidc-overrides.js";
import { redactSecrets } from "./utils/redact.js";
import fs from "node:fs";
import { dirname, join } from "node:path";

async function main() {
  const configPath = process.argv[2];
  const config = loadConfig(configPath);
  const logger = new Logger(config.logPath);

  logger.info("Starting pository", { config: redactSecrets(config) });

  // Initialize services
  const apiKeyService = new ApiKeyService(config.apiKeysPath, config.adminKey);
  const storage = new StorageService(config.dataRoot);
  const overridesService = new OidcOverridesService(
    join(dirname(config.apiKeysPath), "oidc-overrides.json")
  );
  await overridesService.load();

  // Create Fastify instance
  const fastifyOpts: Record<string, unknown> = {
    logger: false, // We use our own logger
    bodyLimit: config.maxUploadSize,
    // Behind nginx every socket peer is loopback; trust X-Forwarded-For from it
    // so request.ip is the real client.
    trustProxy: config.trustProxy,
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

  // Enable CORS - allow origins from config, plus localhost:3001 in dev fallback
  const extraOrigins = config.corsOrigins;
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) { cb(null, true); return; } // same-origin / server-to-server
      if (extraOrigins.length > 0) {
        cb(null, extraOrigins.includes(origin));
        return;
      }
      // No explicit list configured: allow localhost only (safe development default)
      if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
        cb(null, true);
        return;
      }
      cb(null, false);
    },
  });

  // Paths that bypass auth and rate limiting (probes, metrics, public apt repo).
  // Compare on the path only: query strings must not change the outcome.
  const isPublicPath = (url: string): boolean => {
    const p = url.split("?")[0];
    return p === "/healthz" || p === "/readyz" || p === "/metrics" || p.startsWith("/apt/");
  };

  // Register rate limiting. Runs at preHandler, i.e. after the onRequest auth
  // hook below, so the key can be the authenticated identity.
  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: "1 minute",
    hook: "preHandler",
    allowList: (request) => isPublicPath(request.url),
    keyGenerator: (request) =>
      request.apiKey?.id ||
      (request.oidcClaims ? `oidc:${request.oidcClaims.repository}` : undefined) ||
      request.ip,
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
    const tb = request.trackedBytes;
    trackRequest(request.method, reply.statusCode, latency, tb?.bytes, tb?.upload);

    const path = request.url.split("?")[0];
    if (path === "/healthz" || path === "/readyz") return; // probe spam

    logger.info("request", {
      method: request.method,
      url: request.url,
      status: reply.statusCode,
      latency,
      ip: request.ip,
      keyId: request.apiKey?.id,
    });
  });

  // Auth runs at onRequest (it only reads headers) so the rate limiter can key
  // on the authenticated identity. Failed auth attempts never reach the rate
  // limiter, so they get their own per-IP budget to keep key guessing bounded.
  const authMiddleware = createAuthMiddleware(apiKeyService, config);
  const authFailures = new Map<string, { count: number; resetAt: number }>();
  app.addHook("onRequest", async (request, reply) => {
    if (request.is404 || isPublicPath(request.url)) return;

    const now = Date.now();
    const failures = authFailures.get(request.ip);
    if (failures && failures.resetAt > now && failures.count >= config.rateLimitMax) {
      reply.code(429).send({ error: "Too many failed authentication attempts" });
      return;
    }

    await authMiddleware(request, reply);

    if (reply.statusCode === 401) {
      const cur = failures && failures.resetAt > now ? failures : { count: 0, resetAt: now + 60_000 };
      cur.count++;
      authFailures.set(request.ip, cur);
      if (authFailures.size > 10_000) {
        for (const [k, v] of authFailures) if (v.resetAt <= now) authFailures.delete(k);
      }
    }
  });

  // Register routes
  registerHealthRoutes(app, storage);
  registerPackageRoutes(app, storage, apiKeyService, logger, config, overridesService);
  registerKeyRoutes(app, apiKeyService, logger);
  registerWhoamiRoutes(app);
  registerOidcOverridesRoutes(app, overridesService, apiKeyService, logger);
  registerManagementRoutes(app, storage, apiKeyService, logger, config);
  registerAptRoutes(app, storage, config.dataRoot);

  // Backfill md5 for pre-existing packages in the background (non-blocking)
  storage.backfillMd5().catch((err) => logger.warn("md5 backfill failed", { error: String(err) }));

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

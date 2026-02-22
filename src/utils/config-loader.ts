import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { Config, defaultConfig } from "../config.js";

export function loadConfig(configPath?: string): Config {
  const configFile =
    configPath ||
    process.env.POSITORY_CONFIG ||
    "/etc/pository/config.yaml";

  let fileConfig: Partial<Config> = {};

  if (fs.existsSync(configFile)) {
    const content = fs.readFileSync(configFile, "utf-8");
    const parsed = parse(content) as Partial<Config>;
    fileConfig = parsed || {};
  }

  const config: Config = {
    ...defaultConfig,
    ...fileConfig,
    tls: {
      ...defaultConfig.tls,
      ...(fileConfig.tls || {}),
    },
    retention: {
      ...defaultConfig.retention,
      ...(fileConfig.retention || {}),
    },
  };

  // Environment overrides
  if (process.env.POSITORY_DATA_ROOT) {
    config.dataRoot = process.env.POSITORY_DATA_ROOT;
  }
  if (process.env.POSITORY_LOG_PATH) {
    config.logPath = process.env.POSITORY_LOG_PATH;
  }
  if (process.env.POSITORY_PORT) {
    config.port = parseInt(process.env.POSITORY_PORT, 10);
  }
  if (process.env.POSITORY_BIND_ADDRESS) {
    config.bindAddress = process.env.POSITORY_BIND_ADDRESS;
  }
  if (process.env.POSITORY_ADMIN_KEY) {
    config.adminKey = process.env.POSITORY_ADMIN_KEY;
  }
  if (process.env.POSITORY_API_KEYS_PATH) {
    config.apiKeysPath = process.env.POSITORY_API_KEYS_PATH;
  }
  if (process.env.POSITORY_TLS_CERT) {
    config.tls.cert = process.env.POSITORY_TLS_CERT;
    config.tls.enabled = true;
  }
  if (process.env.POSITORY_TLS_KEY) {
    config.tls.key = process.env.POSITORY_TLS_KEY;
    config.tls.enabled = true;
  }
  if (process.env.POSITORY_MAX_UPLOAD_SIZE) {
    config.maxUploadSize = parseInt(process.env.POSITORY_MAX_UPLOAD_SIZE, 10);
  }
  if (process.env.POSITORY_CORS_ORIGINS) {
    config.corsOrigins = process.env.POSITORY_CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean);
  }

  // Ensure directories exist
  ensureDir(config.dataRoot);
  ensureDir(config.logPath);
  ensureDir(path.dirname(config.apiKeysPath));

  return config;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

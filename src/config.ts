export interface TlsConfig {
  enabled: boolean;
  cert?: string;
  key?: string;
}

export interface RetentionConfig {
  enabled: boolean;
  keepLastN?: number;
  maxAgeDays?: number;
}

export interface Config {
  dataRoot: string;
  logPath: string;
  port: number;
  bindAddress: string;
  tls: TlsConfig;
  retention: RetentionConfig;
  maxUploadSize: number;
  allowedRepos: string[];
  corsOrigins: string[];
  adminKey?: string;
  apiKeysPath: string;
}

export const defaultConfig: Config = {
  dataRoot: "/var/lib/pository",
  logPath: "/var/log/pository",
  port: 3000,
  bindAddress: "0.0.0.0",
  tls: {
    enabled: false,
  },
  retention: {
    enabled: false,
  },
  maxUploadSize: 100 * 1024 * 1024, // 100MB
  allowedRepos: ["default"],
  corsOrigins: [],
  apiKeysPath: "/etc/pository/api-keys.json",
};

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
  // GitHub OIDC authentication
  oidcAudience?: string;                          // JWT audience; defaults to 'pository'
  oidcAllowedOwners?: string[];                   // GitHub owners allowed by default rule; defaults to ['rsxdalv']
  oidcRequirePrivate?: boolean;                   // Only allow private repos via default rule; defaults to true
  oidcOverrides?: Record<string, string[]>;       // Per-repo package allowlist, e.g. { 'rsxdalv/mono-repo': ['svc-a', 'svc-b'] }
}

export const defaultConfig: Config = {
  dataRoot: "/var/lib/pository",
  logPath: "/var/log/pository",
  port: 3222,
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
  oidcAudience: "pository",
  oidcAllowedOwners: ["rsxdalv"],
  oidcRequirePrivate: true,
  oidcOverrides: {},
};

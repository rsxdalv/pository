import crypto from "node:crypto";
import fs from "node:fs";
import * as argon2 from "argon2";

export type ApiKeyRole = "admin" | "write" | "read";

export interface ApiKeyScope {
  repos?: string[];
  distributions?: string[];
}

export interface ApiKeyData {
  id: string;
  hash: string;
  role: ApiKeyRole;
  scope?: ApiKeyScope;
  createdAt: string;
  lastUsed?: string;
  description?: string;
}

export interface ApiKeyStore {
  keys: ApiKeyData[];
}

export class ApiKeyService {
  private keysPath: string;
  private adminKey?: string;
  private store: ApiKeyStore = { keys: [] };

  constructor(keysPath: string, adminKey?: string) {
    this.keysPath = keysPath;
    this.adminKey = adminKey;
    this.load();
  }

  private load(): void {
    if (fs.existsSync(this.keysPath)) {
      const content = fs.readFileSync(this.keysPath, "utf-8");
      this.store = JSON.parse(content);
    }
  }

  private save(): void {
    fs.writeFileSync(this.keysPath, JSON.stringify(this.store, null, 2));
  }

  async createKey(
    role: ApiKeyRole,
    description?: string,
    scope?: ApiKeyScope
  ): Promise<{ id: string; key: string }> {
    const id = crypto.randomBytes(8).toString("hex");
    const key = crypto.randomBytes(32).toString("hex");
    const hash = await argon2.hash(key);

    const keyData: ApiKeyData = {
      id,
      hash,
      role,
      scope,
      createdAt: new Date().toISOString(),
      description,
    };

    this.store.keys.push(keyData);
    this.save();

    return { id, key };
  }

  async validateKey(key: string): Promise<ApiKeyData | null> {
    // Check admin key first
    if (this.adminKey && key === this.adminKey) {
      return {
        id: "admin",
        hash: "",
        role: "admin",
        createdAt: new Date().toISOString(),
        description: "Bootstrap admin key",
      };
    }

    for (const keyData of this.store.keys) {
      try {
        if (await argon2.verify(keyData.hash, key)) {
          // Update last used
          keyData.lastUsed = new Date().toISOString();
          this.save();
          return keyData;
        }
      } catch {
        // Invalid hash format, skip
      }
    }

    return null;
  }

  deleteKey(id: string): boolean {
    const index = this.store.keys.findIndex((k) => k.id === id);
    if (index === -1) {
      return false;
    }
    this.store.keys.splice(index, 1);
    this.save();
    return true;
  }

  listKeys(): Omit<ApiKeyData, "hash">[] {
    return this.store.keys.map((k) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { hash: _hash, ...rest } = k;
      return rest;
    });
  }

  hasPermission(
    keyData: ApiKeyData,
    requiredRole: ApiKeyRole,
    repo?: string,
    distribution?: string
  ): boolean {
    const roleHierarchy: Record<ApiKeyRole, number> = {
      admin: 3,
      write: 2,
      read: 1,
    };

    if (roleHierarchy[keyData.role] < roleHierarchy[requiredRole]) {
      return false;
    }

    if (keyData.scope) {
      if (repo && keyData.scope.repos && !keyData.scope.repos.includes(repo)) {
        return false;
      }
      if (
        distribution &&
        keyData.scope.distributions &&
        !keyData.scope.distributions.includes(distribution)
      ) {
        return false;
      }
    }

    return true;
  }
}

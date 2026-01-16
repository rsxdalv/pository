import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, ChildProcess } from "node:child_process";

describe("API Integration Tests", () => {
  let serverProcess: ChildProcess | null = null;
  let testDir: string;
  let configPath: string;
  const port = 3099;
  const adminKey = "test-admin-key-12345";

  before(async () => {
    // Create test directories
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "pository-integration-"));
    const dataDir = path.join(testDir, "data");
    const logDir = path.join(testDir, "logs");
    const configDir = path.join(testDir, "config");
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(logDir, { recursive: true });
    fs.mkdirSync(configDir, { recursive: true });

    // Create config file
    configPath = path.join(configDir, "config.yaml");
    const config = `
dataRoot: ${dataDir}
logPath: ${logDir}
port: ${port}
bindAddress: 127.0.0.1
maxUploadSize: 10485760
allowedRepos:
  - default
  - test
apiKeysPath: ${path.join(configDir, "api-keys.json")}
adminKey: ${adminKey}
`;
    fs.writeFileSync(configPath, config);
    fs.writeFileSync(path.join(configDir, "api-keys.json"), '{"keys":[]}');

    // Start server
    serverProcess = spawn("node", ["--import=tsx", "src/index.ts", configPath], {
      cwd: process.cwd(),
      stdio: "pipe",
    });

    // Wait for server to start
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Server start timeout")), 10000);

      serverProcess!.stdout?.on("data", (data) => {
        const output = data.toString();
        if (output.includes("Server listening")) {
          clearTimeout(timeout);
          resolve();
        }
      });

      serverProcess!.stderr?.on("data", (data) => {
        console.error("Server stderr:", data.toString());
      });

      serverProcess!.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  });

  after(async () => {
    if (serverProcess) {
      serverProcess.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 500));
    }
    if (testDir) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  const baseUrl = `http://127.0.0.1:${port}`;

  async function apiRequest(
    method: string,
    path: string,
    options: {
      body?: unknown;
      headers?: Record<string, string>;
      formData?: FormData;
    } = {}
  ): Promise<{ status: number; data: unknown }> {
    const headers: Record<string, string> = {
      "X-Api-Key": adminKey,
      ...options.headers,
    };

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (options.body && !(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
      fetchOptions.body = JSON.stringify(options.body);
    } else if (options.formData) {
      fetchOptions.body = options.formData;
      delete headers["Content-Type"]; // Let fetch set it for multipart
    }

    fetchOptions.headers = headers;

    const response = await fetch(`${baseUrl}${path}`, fetchOptions);
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    return { status: response.status, data };
  }

  describe("Health endpoints", () => {
    it("GET /healthz should return ok", async () => {
      const res = await fetch(`${baseUrl}/healthz`);
      assert.strictEqual(res.status, 200);
      const data = await res.json() as { status: string };
      assert.strictEqual(data.status, "ok");
    });

    it("GET /readyz should return ready", async () => {
      const res = await fetch(`${baseUrl}/readyz`);
      assert.strictEqual(res.status, 200);
      const data = await res.json() as { status: string };
      assert.strictEqual(data.status, "ready");
    });

    it("GET /metrics should return prometheus metrics", async () => {
      const res = await fetch(`${baseUrl}/metrics`);
      assert.strictEqual(res.status, 200);
      const text = await res.text();
      assert.ok(text.includes("pository_requests_total"));
      assert.ok(text.includes("pository_packages_total"));
    });
  });

  describe("Authentication", () => {
    it("should reject requests without API key", async () => {
      const res = await fetch(`${baseUrl}/api/v1/packages`, {
        headers: {},
      });
      assert.strictEqual(res.status, 401);
    });

    it("should reject requests with invalid API key", async () => {
      const res = await fetch(`${baseUrl}/api/v1/packages`, {
        headers: { "X-Api-Key": "invalid-key" },
      });
      assert.strictEqual(res.status, 401);
    });

    it("should accept requests with valid admin key", async () => {
      const { status, data } = await apiRequest("GET", "/api/v1/packages");
      assert.strictEqual(status, 200);
      assert.ok(data);
    });
  });

  describe("API Key management", () => {
    it("POST /api/v1/keys should create new key", async () => {
      const { status, data } = await apiRequest("POST", "/api/v1/keys", {
        body: { role: "read", description: "Test read key" },
      });
      assert.strictEqual(status, 201);
      const keyData = data as { id: string; key: string; role: string };
      assert.ok(keyData.id);
      assert.ok(keyData.key);
      assert.strictEqual(keyData.role, "read");
    });

    it("GET /api/v1/keys should list keys", async () => {
      const { status, data } = await apiRequest("GET", "/api/v1/keys");
      assert.strictEqual(status, 200);
      const keysData = data as { keys: unknown[] };
      assert.ok(Array.isArray(keysData.keys));
    });

    it("DELETE /api/v1/keys/:id should delete key", async () => {
      // Create a key first
      const createRes = await apiRequest("POST", "/api/v1/keys", {
        body: { role: "read" },
      });
      const keyData = createRes.data as { id: string };

      // Delete it
      const { status } = await apiRequest("DELETE", `/api/v1/keys/${keyData.id}`);
      assert.strictEqual(status, 204);
    });
  });

  describe("Package operations", () => {
    it("GET /api/v1/packages should list packages (empty)", async () => {
      const { status, data } = await apiRequest("GET", "/api/v1/packages");
      assert.strictEqual(status, 200);
      const pkgData = data as { packages: unknown[] };
      assert.ok(Array.isArray(pkgData.packages));
    });

    it("POST /api/v1/packages should reject invalid deb", async () => {
      const formData = new FormData();
      formData.append("repo", "default");
      formData.append("distribution", "stable");
      formData.append("component", "main");
      formData.append("file", new Blob(["not a deb"]), "test_1.0.0_amd64.deb");

      const { status, data } = await apiRequest("POST", "/api/v1/packages", {
        formData,
      });
      assert.strictEqual(status, 400);
      const errData = data as { error: string };
      assert.ok(errData.error);
    });
  });

  describe("Permission checks", () => {
    it("should enforce write permission for uploads", async () => {
      // Create a read-only key
      const createRes = await apiRequest("POST", "/api/v1/keys", {
        body: { role: "read" },
      });
      const readKey = (createRes.data as { key: string }).key;

      const formData = new FormData();
      formData.append("repo", "default");
      formData.append("file", new Blob(["test"]), "test_1.0.0_amd64.deb");

      const res = await fetch(`${baseUrl}/api/v1/packages`, {
        method: "POST",
        headers: { "X-Api-Key": readKey },
        body: formData,
      });
      assert.strictEqual(res.status, 403);
    });

    it("should enforce admin permission for delete", async () => {
      // Create a write key
      const createRes = await apiRequest("POST", "/api/v1/keys", {
        body: { role: "write" },
      });
      const writeKey = (createRes.data as { key: string }).key;

      const res = await fetch(
        `${baseUrl}/api/v1/packages/default/stable/main/amd64/test/1.0.0`,
        {
          method: "DELETE",
          headers: { "X-Api-Key": writeKey },
        }
      );
      assert.strictEqual(res.status, 403);
    });
  });
});

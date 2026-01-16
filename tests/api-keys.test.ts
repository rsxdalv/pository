import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ApiKeyService } from "../src/services/api-keys.js";

describe("ApiKeyService", () => {
  let service: ApiKeyService;
  let testDir: string;
  let keysPath: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "pository-keys-test-"));
    keysPath = path.join(testDir, "api-keys.json");
    service = new ApiKeyService(keysPath);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it("should create and validate API key", async () => {
    const { id, key } = await service.createKey("read", "Test key");

    assert.ok(id);
    assert.ok(key);

    const validated = await service.validateKey(key);
    assert.ok(validated);
    assert.strictEqual(validated.id, id);
    assert.strictEqual(validated.role, "read");
  });

  it("should return null for invalid key", async () => {
    const validated = await service.validateKey("invalid-key");
    assert.strictEqual(validated, null);
  });

  it("should validate admin bootstrap key", async () => {
    const adminKey = "test-admin-key";
    const serviceWithAdmin = new ApiKeyService(keysPath, adminKey);

    const validated = await serviceWithAdmin.validateKey(adminKey);
    assert.ok(validated);
    assert.strictEqual(validated.role, "admin");
    assert.strictEqual(validated.id, "admin");
  });

  it("should list keys without hash", async () => {
    await service.createKey("read", "Key 1");
    await service.createKey("write", "Key 2");

    const keys = service.listKeys();
    assert.strictEqual(keys.length, 2);

    // Ensure hash is not exposed
    for (const key of keys) {
      assert.ok(!("hash" in key));
    }
  });

  it("should delete key", async () => {
    const { id, key } = await service.createKey("read", "Test key");

    const deleted = service.deleteKey(id);
    assert.strictEqual(deleted, true);

    const validated = await service.validateKey(key);
    assert.strictEqual(validated, null);
  });

  it("should return false when deleting non-existent key", () => {
    const deleted = service.deleteKey("non-existent");
    assert.strictEqual(deleted, false);
  });

  it("should check permissions correctly - admin", async () => {
    const { key } = await service.createKey("admin");
    const keyData = await service.validateKey(key);
    assert.ok(keyData);

    assert.strictEqual(service.hasPermission(keyData, "admin"), true);
    assert.strictEqual(service.hasPermission(keyData, "write"), true);
    assert.strictEqual(service.hasPermission(keyData, "read"), true);
  });

  it("should check permissions correctly - write", async () => {
    const { key } = await service.createKey("write");
    const keyData = await service.validateKey(key);
    assert.ok(keyData);

    assert.strictEqual(service.hasPermission(keyData, "admin"), false);
    assert.strictEqual(service.hasPermission(keyData, "write"), true);
    assert.strictEqual(service.hasPermission(keyData, "read"), true);
  });

  it("should check permissions correctly - read", async () => {
    const { key } = await service.createKey("read");
    const keyData = await service.validateKey(key);
    assert.ok(keyData);

    assert.strictEqual(service.hasPermission(keyData, "admin"), false);
    assert.strictEqual(service.hasPermission(keyData, "write"), false);
    assert.strictEqual(service.hasPermission(keyData, "read"), true);
  });

  it("should enforce repo scope", async () => {
    const { key } = await service.createKey("write", "Scoped key", {
      repos: ["repo1"],
    });
    const keyData = await service.validateKey(key);
    assert.ok(keyData);

    assert.strictEqual(service.hasPermission(keyData, "write", "repo1"), true);
    assert.strictEqual(service.hasPermission(keyData, "write", "repo2"), false);
  });

  it("should update lastUsed on validation", async () => {
    const { key } = await service.createKey("read");

    // Wait a bit to ensure time difference
    await new Promise((r) => setTimeout(r, 10));

    const validated = await service.validateKey(key);
    assert.ok(validated);
    assert.ok(validated.lastUsed);
  });

  it("should persist keys to file", async () => {
    const { id, key } = await service.createKey("read", "Persistent key");

    // Create new service instance reading from same file
    const newService = new ApiKeyService(keysPath);

    const validated = await newService.validateKey(key);
    assert.ok(validated);
    assert.strictEqual(validated.id, id);
  });
});

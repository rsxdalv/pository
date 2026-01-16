import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { StorageService, PackageLocation } from "../src/services/storage.js";

describe("StorageService", () => {
  let storage: StorageService;
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "pository-test-"));
    storage = new StorageService(testDir);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  const testLoc: PackageLocation = {
    repo: "default",
    distribution: "stable",
    component: "main",
    architecture: "amd64",
    name: "test-pkg",
    version: "1.0.0",
  };

  const testBuffer = Buffer.from("test content");

  it("should store and retrieve package", async () => {
    const metadata = await storage.storePackage(testLoc, testBuffer, "test-key");

    assert.strictEqual(metadata.name, testLoc.name);
    assert.strictEqual(metadata.version, testLoc.version);
    assert.strictEqual(metadata.architecture, testLoc.architecture);
    assert.strictEqual(metadata.size, testBuffer.length);
    assert.ok(metadata.sha256);
    assert.ok(metadata.uploadedAt);
  });

  it("should get package file path", async () => {
    await storage.storePackage(testLoc, testBuffer, "test-key");

    const filePath = storage.getPackageFile(testLoc);
    assert.ok(filePath);
    assert.ok(fs.existsSync(filePath));
  });

  it("should get package metadata", async () => {
    await storage.storePackage(testLoc, testBuffer, "test-key");

    const metadata = storage.getPackageMetadata(testLoc);
    assert.ok(metadata);
    assert.strictEqual(metadata.name, testLoc.name);
  });

  it("should list packages", async () => {
    await storage.storePackage(testLoc, testBuffer, "test-key");

    const packages = storage.listPackages({});
    assert.strictEqual(packages.length, 1);
    assert.strictEqual(packages[0].name, testLoc.name);
  });

  it("should filter packages", async () => {
    await storage.storePackage(testLoc, testBuffer, "test-key");

    const loc2 = { ...testLoc, name: "other-pkg" };
    await storage.storePackage(loc2, testBuffer, "test-key");

    const filtered = storage.listPackages({ name: "test-pkg" });
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].name, "test-pkg");
  });

  it("should delete package", async () => {
    await storage.storePackage(testLoc, testBuffer, "test-key");

    const deleted = storage.deletePackage(testLoc);
    assert.strictEqual(deleted, true);

    const filePath = storage.getPackageFile(testLoc);
    assert.strictEqual(filePath, null);
  });

  it("should return false when deleting non-existent package", () => {
    const deleted = storage.deletePackage(testLoc);
    assert.strictEqual(deleted, false);
  });

  it("should update existing package on re-upload", async () => {
    await storage.storePackage(testLoc, testBuffer, "test-key");

    const newBuffer = Buffer.from("updated content");
    await storage.storePackage(testLoc, newBuffer, "test-key");

    const packages = storage.listPackages({});
    assert.strictEqual(packages.length, 1);

    const metadata = storage.getPackageMetadata(testLoc);
    assert.strictEqual(metadata?.size, newBuffer.length);
  });

  it("should get storage stats", async () => {
    await storage.storePackage(testLoc, testBuffer, "test-key");

    const stats = storage.getStorageStats();
    assert.strictEqual(stats.packageCount, 1);
    assert.strictEqual(stats.totalSize, testBuffer.length);
  });

  it("should check storage readiness", () => {
    assert.strictEqual(storage.isStorageReady(), true);
  });
});

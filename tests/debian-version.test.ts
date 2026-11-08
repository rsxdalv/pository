import { describe, it } from "node:test";
import assert from "node:assert";
import { compareDebianVersions, parseDebianVersion } from "../src/services/debian-version.js";
import { selectPrunable } from "../src/services/prune.js";
import type { PackageMetadata } from "../src/services/storage.js";

const sign = (n: number) => Math.sign(n);
const lt = (a: string, b: string) => {
  assert.strictEqual(sign(compareDebianVersions(a, b)), -1, `${a} < ${b}`);
  assert.strictEqual(sign(compareDebianVersions(b, a)), 1, `${b} > ${a}`);
};
const eq = (a: string, b: string) => assert.strictEqual(compareDebianVersions(a, b), 0, `${a} == ${b}`);

describe("parseDebianVersion", () => {
  it("splits epoch, upstream and revision", () => {
    assert.deepStrictEqual(parseDebianVersion("1:2.3-4"), { epoch: 1, upstream: "2.3", revision: "4" });
    assert.deepStrictEqual(parseDebianVersion("2.3"), { epoch: 0, upstream: "2.3", revision: "" });
  });
  it("uses the last hyphen for the revision", () => {
    assert.deepStrictEqual(parseDebianVersion("1.2-3-4"), { epoch: 0, upstream: "1.2-3", revision: "4" });
  });
  it("does not treat a non-numeric prefix as an epoch", () => {
    assert.strictEqual(parseDebianVersion("a:1").epoch, 0);
  });
});

describe("compareDebianVersions", () => {
  it("compares numerically, not lexically", () => {
    lt("1.2", "1.10");
    lt("9", "10");
    lt("1.0.9", "1.0.10");
  });
  it("ignores leading zeros", () => {
    eq("1.01", "1.1");
    lt("1.002", "1.3");
  });
  it("epoch dominates", () => {
    lt("9.9", "1:0.1");
    lt("1:1.0", "2:0.1");
    eq("0:1.0", "1.0");
  });
  it("compares revision after upstream", () => {
    lt("1.0-1", "1.0-2");
    lt("1.0-2", "1.0-10");
    lt("1.0-9", "1.1-1");
    lt("1.0", "1.0-1");
  });
  it("tilde sorts before everything, including end of string", () => {
    lt("1.0~rc1", "1.0");
    lt("1.0~rc1", "1.0~rc2");
    lt("1.0~~", "1.0~");
    lt("1.0~", "1.0");
    lt("1.0~rc1-1", "1.0-1");
    lt("1.0-1~bpo1", "1.0-1");
  });
  it("letters sort before non-letters; plus sorts after end", () => {
    lt("1.0", "1.0a");
    lt("1.0a", "1.0+");
    lt("1.0a", "1.0b");
    lt("1.0+dfsg", "1.0+dfsg1");
    lt("1.0", "1.0+git1");
  });
  it("handles typical real-world versions", () => {
    lt("2.36.1-8+deb11u1", "2.36.1-8+deb11u2");
    lt("1.2.3", "1.2.3+b1");
    lt("0.9.9", "0.10.0");
    lt("1.0.0-1ubuntu1", "1.0.0-1ubuntu2");
    lt("2.0~beta1-1", "2.0-1");
  });
  it("is reflexive and handles very long numbers", () => {
    eq("1.2.3-4", "1.2.3-4");
    lt("1.99999999999999999999", "1.100000000000000000000");
  });
});

describe("selectPrunable", () => {
  const mk = (version: string, uploadedAt = "2024-01-01T00:00:00.000Z", name = "a"): PackageMetadata => ({
    name, version, architecture: "amd64", size: 10, sha256: "x", mime: "m", uploadedAt,
    uploaderKeyId: "k", repo: "default", distribution: "stable", component: "main",
  });

  it("keeps the newest N by Debian version (not upload time)", () => {
    const pkgs = [mk("1.10"), mk("1.2"), mk("1.9"), mk("1.0~rc1")];
    const out = selectPrunable(pkgs, { keepLastN: 2 }).map((p) => p.version).sort();
    assert.deepStrictEqual(out, ["1.0~rc1", "1.2"].sort());
  });
  it("groups independently by name", () => {
    const pkgs = [mk("1"), mk("2"), mk("1", undefined, "b")];
    assert.deepStrictEqual(selectPrunable(pkgs, { keepLastN: 1 }).map((p) => p.version), ["1"]);
  });
  it("never returns protected versions", () => {
    const pkgs = [mk("1"), mk("2"), mk("3")];
    const out = selectPrunable(pkgs, { keepLastN: 1 }, { protect: (p) => p.version === "1" });
    assert.deepStrictEqual(out.map((p) => p.version), ["2"]);
  });
  it("maxAgeDays only deletes old versions beyond keepLastN", () => {
    const now = Date.parse("2024-03-01T00:00:00Z");
    const pkgs = [mk("1", "2024-01-01T00:00:00Z"), mk("2", "2024-02-28T00:00:00Z"), mk("3", "2024-02-29T00:00:00Z")];
    const out = selectPrunable(pkgs, { keepLastN: 1, maxAgeDays: 30 }, { now });
    assert.deepStrictEqual(out.map((p) => p.version), ["1"]);
  });
  it("maxAgeDays alone keeps at least one version", () => {
    const now = Date.parse("2025-01-01T00:00:00Z");
    const pkgs = [mk("1"), mk("2")];
    const out = selectPrunable(pkgs, { maxAgeDays: 30 }, { now });
    assert.deepStrictEqual(out.map((p) => p.version), ["1"]);
  });
  it("does nothing without a policy", () => {
    assert.deepStrictEqual(selectPrunable([mk("1"), mk("2")], {}), []);
  });
});

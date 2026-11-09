import { describe, it } from "node:test";
import assert from "node:assert";
import { decideOverwrite } from "../src/services/overwrite-policy.js";

describe("decideOverwrite", () => {
  const a = "a".repeat(64);
  const b = "b".repeat(64);

  it("stores new versions under every policy", () => {
    for (const policy of ["allow", "default-branch", "reject"] as const) {
      assert.strictEqual(decideOverwrite({ newSha256: a, policy, oidcRef: "refs/pull/1/merge" }), "store");
    }
  });

  it("treats identical content as unchanged under every policy", () => {
    for (const policy of ["allow", "default-branch", "reject"] as const) {
      assert.strictEqual(decideOverwrite({ existingSha256: a, newSha256: a, policy, oidcRef: "refs/pull/1/merge" }), "unchanged");
    }
  });

  it("allow: replaces from any ref", () => {
    assert.strictEqual(decideOverwrite({ existingSha256: a, newSha256: b, policy: "allow", oidcRef: "refs/pull/9/merge" }), "store");
  });

  it("reject: refuses even from main", () => {
    assert.strictEqual(decideOverwrite({ existingSha256: a, newSha256: b, policy: "reject", oidcRef: "refs/heads/main" }), "conflict");
    assert.strictEqual(decideOverwrite({ existingSha256: a, newSha256: b, policy: "reject" }), "conflict");
  });

  it("default-branch: main/master may replace, PRs, branches and tags may not", () => {
    const d = (oidcRef?: string) => decideOverwrite({ existingSha256: a, newSha256: b, oidcRef });
    assert.strictEqual(d("refs/heads/main"), "store");
    assert.strictEqual(d("refs/heads/master"), "store");
    assert.strictEqual(d("refs/pull/8/merge"), "conflict");
    assert.strictEqual(d("refs/heads/feat/x"), "conflict");
    assert.strictEqual(d("refs/tags/v1.0.0"), "conflict");
  });

  it("default-branch: API-key uploads (no ref) may replace", () => {
    assert.strictEqual(decideOverwrite({ existingSha256: a, newSha256: b }), "store");
  });

  it("default-branch: honours a custom ref allowlist", () => {
    const allowedRefs = ["refs/heads/release"];
    assert.strictEqual(decideOverwrite({ existingSha256: a, newSha256: b, oidcRef: "refs/heads/release", allowedRefs }), "store");
    assert.strictEqual(decideOverwrite({ existingSha256: a, newSha256: b, oidcRef: "refs/heads/main", allowedRefs }), "conflict");
  });
});

import { describe, it } from "node:test";
import assert from "node:assert";
import type { FastifyRequest } from "fastify";
import { authenticateSso, resolveSsoRole } from "../src/middleware/auth.js";
import { defaultConfig, Config } from "../src/config.js";

const cfg = (over: Partial<Config> = {}): Config => ({ ...defaultConfig, ssoSecret: "s3cret", ...over });
const req = (headers: Record<string, string>) => ({ headers }) as unknown as FastifyRequest;

describe("Authelia SSO auth", () => {
  it("is disabled when no secret is configured", () => {
    const r = req({ "x-pository-sso-secret": "s3cret", "remote-user": "rob", "remote-groups": "admins" });
    assert.strictEqual(authenticateSso(r, { ...defaultConfig }), undefined);
  });

  it("rejects missing or wrong secret even with Remote-User spoofed", () => {
    assert.strictEqual(authenticateSso(req({ "remote-user": "rob", "remote-groups": "admins" }), cfg()), undefined);
    assert.strictEqual(
      authenticateSso(req({ "x-pository-sso-secret": "nope", "remote-user": "rob", "remote-groups": "admins" }), cfg()),
      undefined
    );
  });

  it("rejects a valid secret with no Remote-User", () => {
    assert.strictEqual(authenticateSso(req({ "x-pository-sso-secret": "s3cret" }), cfg()), undefined);
  });

  it("maps admin group to admin role", () => {
    const k = authenticateSso(req({ "x-pository-sso-secret": "s3cret", "remote-user": "rob", "remote-groups": "dev,admins" }), cfg());
    assert.strictEqual(k?.role, "admin");
    assert.strictEqual(k?.id, "sso:rob");
  });

  it("falls back to default role and honours none", () => {
    const h = { "x-pository-sso-secret": "s3cret", "remote-user": "bob", "remote-groups": "dev" };
    assert.strictEqual(authenticateSso(req(h), cfg())?.role, "read");
    assert.strictEqual(authenticateSso(req(h), cfg({ ssoDefaultRole: "none" })), undefined);
  });

  it("maps write groups", () => {
    assert.strictEqual(resolveSsoRole(cfg({ ssoWriteGroups: ["ci"] }), ["ci"]), "write");
  });
});

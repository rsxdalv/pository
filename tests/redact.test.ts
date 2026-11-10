import { test } from "node:test";
import assert from "node:assert/strict";
import { redactSecrets } from "../src/utils/redact.js";

test("redacts secret-looking keys at any depth", () => {
  const input = {
    port: 3222,
    adminKey: "admin-123",
    ssoSecret: "sso-456",
    tls: { enabled: true, key: "/etc/pository/server.key" },
    nested: [{ dbPassword: "pw", name: "x" }],
    apiToken: "",
  };
  const out = redactSecrets(input);
  assert.equal(out.adminKey, "***");
  assert.equal(out.ssoSecret, "***");
  assert.equal(out.nested[0].dbPassword, "***");
  assert.equal(out.nested[0].name, "x");
  assert.equal(out.port, 3222);
  assert.equal(out.tls.key, "/etc/pository/server.key");
  assert.equal(out.apiToken, "");
  // input untouched
  assert.equal(input.ssoSecret, "sso-456");
});

test("startup log line never contains the SSO secret", () => {
  const out = JSON.stringify(redactSecrets({ ssoSecret: "s3cr3t-value", adminKey: "k" }));
  assert.ok(!out.includes("s3cr3t-value"));
});

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { spawn, execFileSync, ChildProcess } from "node:child_process";

interface TestServer {
  base: string;
  dir: string;
  proc: ChildProcess;
  stop(): Promise<void>;
}

const adminKey = "test-admin-key-features";

async function startServer(port: number, extraConfig = "", env: Record<string, string> = {}): Promise<TestServer> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pository-features-"));
  const dataDir = path.join(dir, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const configPath = path.join(dir, "config.yaml");
  fs.writeFileSync(path.join(dir, "api-keys.json"), '{"keys":[]}');
  fs.writeFileSync(
    configPath,
    `dataRoot: ${dataDir}
logPath: ${path.join(dir, "logs")}
port: ${port}
bindAddress: 127.0.0.1
maxUploadSize: 10485760
allowedRepos: [default, other]
apiKeysPath: ${path.join(dir, "api-keys.json")}
adminKey: ${adminKey}
${extraConfig}
`
  );
  const proc = spawn("node", ["--import=tsx", "src/index.ts", configPath], {
    cwd: process.cwd(),
    stdio: "pipe",
    env: { ...process.env, ...env },
  });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Server start timeout")), 15000);
    proc.stdout?.on("data", (d) => {
      if (d.toString().includes("Server listening")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    proc.on("error", reject);
  });
  return {
    base: `http://127.0.0.1:${port}`,
    dir,
    proc,
    async stop() {
      proc.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 300));
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

function buildDeb(name: string, version: string, arch = "amd64", descSuffix = ""): Buffer {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deb-build-"));
  fs.mkdirSync(path.join(root, "DEBIAN"));
  fs.writeFileSync(
    path.join(root, "DEBIAN", "control"),
    `Package: ${name}\nVersion: ${version}\nArchitecture: ${arch}\nMaintainer: T <t@example.com>\nDescription: test ${name}${descSuffix}\n`
  );
  const out = path.join(root, "out.deb");
  execFileSync("dpkg-deb", ["-Zgzip", "--build", path.join(root), out], { stdio: "pipe" });
  const buf = fs.readFileSync(out);
  fs.rmSync(root, { recursive: true, force: true });
  return buf;
}

async function upload(srv: TestServer, deb: Buffer, repo = "default", headers: Record<string, string> = {}) {
  const form = new FormData();
  form.append("repo", repo);
  form.append("distribution", "stable");
  form.append("component", "main");
  form.append("file", new Blob([new Uint8Array(deb)]), "x.deb");
  return fetch(`${srv.base}/api/v1/packages`, { method: "POST", headers: { "X-Api-Key": adminKey, ...headers }, body: form });
}

const authed = { "X-Api-Key": adminKey };

async function getJson<T = any>(srv: TestServer, p: string, headers: Record<string, string> = authed) {
  const res = await fetch(`${srv.base}${p}`, { headers });
  return { status: res.status, data: (await res.json()) as T };
}

async function prune(srv: TestServer, body: unknown) {
  const res = await fetch(`${srv.base}/api/v1/packages/prune`, {
    method: "POST",
    headers: { ...authed, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json()) as any };
}

describe("Backend features", () => {
  let srv: TestServer;
  const debs: Record<string, Buffer> = {};

  before(async () => {
    srv = await startServer(3097);
    for (const v of ["1.2", "1.10", "1.9", "1.0~rc1"]) debs[v] = buildDeb("foo", v);
    debs.bar = buildDeb("bar", "1.0", "all");
    for (const v of Object.keys(debs)) {
      const res = await upload(srv, debs[v]);
      assert.strictEqual(res.status, 201, await res.clone().text());
    }
  });
  after(async () => srv.stop());

  it("stores md5 at upload time", async () => {
    const { data } = await getJson(srv, "/api/v1/packages?name=foo");
    for (const p of data.packages) {
      assert.match(p.md5, /^[0-9a-f]{32}$/);
    }
    const d = data.packages.find((p: any) => p.version === "1.2");
    assert.strictEqual(d.md5, crypto.createHash("md5").update(debs["1.2"]).digest("hex"));
  });

  it("GET /api/v1/info", async () => {
    const { status, data } = await getJson(srv, "/api/v1/info");
    assert.strictEqual(status, 200);
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf-8"));
    assert.deepStrictEqual(data, {
      version: pkg.version,
      allowedRepos: ["default", "other"],
      maxUploadSize: 10485760,
      retention: { enabled: false },
    });
  });

  it("GET /api/v1/info requires auth", async () => {
    const res = await fetch(`${srv.base}/api/v1/info`);
    assert.strictEqual(res.status, 401);
  });

  it("GET /api/v1/stats", async () => {
    const { status, data } = await getJson(srv, "/api/v1/stats");
    assert.strictEqual(status, 200);
    assert.strictEqual(data.versionCount, 5);
    assert.strictEqual(data.packageCount, 2);
    assert.strictEqual(data.byRepo.default.count, 5);
    assert.strictEqual(data.byArchitecture.amd64, 4);
    assert.strictEqual(data.byArchitecture.all, 1);
    assert.strictEqual(data.totalSize, Object.values(debs).reduce((a, b) => a + b.length, 0));
    assert.strictEqual(data.uploadsByDay.length, 30);
    assert.strictEqual(data.uploadsByDay[29].date, new Date().toISOString().slice(0, 10));
    assert.strictEqual(data.uploadsByDay[29].count, 5);
    assert.strictEqual(data.uploadsByDay[0].count, 0);
    assert.ok(data.recentUploads.length <= 10 && data.recentUploads.length === 5);
    const times = data.recentUploads.map((p: any) => Date.parse(p.uploadedAt));
    assert.deepStrictEqual(times, [...times].sort((a, b) => b - a));
  });

  it("download endpoint sets headers and streams the deb", async () => {
    const res = await fetch(
      `${srv.base}/api/v1/packages/default/stable/main/amd64/foo/1.2/download`,
      { headers: authed }
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("content-type"), "application/vnd.debian.binary-package");
    assert.strictEqual(res.headers.get("content-disposition"), 'attachment; filename="foo_1.2_amd64.deb"');
    assert.strictEqual(res.headers.get("content-length"), String(debs["1.2"].length));
    assert.strictEqual(
      res.headers.get("x-checksum-sha256"),
      crypto.createHash("sha256").update(debs["1.2"]).digest("hex")
    );
    const body = Buffer.from(await res.arrayBuffer());
    assert.ok(body.equals(debs["1.2"]));
  });

  it("download endpoint 404s and requires auth", async () => {
    const miss = await fetch(`${srv.base}/api/v1/packages/default/stable/main/amd64/foo/9.9/download`, { headers: authed });
    assert.strictEqual(miss.status, 404);
    const noauth = await fetch(`${srv.base}/api/v1/packages/default/stable/main/amd64/foo/1.2/download`);
    assert.strictEqual(noauth.status, 401);
  });

  it("/repo download accepts ?repo= and defaults to default", async () => {
    const ok = await fetch(`${srv.base}/repo/stable/main/amd64/foo_1.2.deb`, { headers: authed });
    assert.strictEqual(ok.status, 200);
    await ok.arrayBuffer();
    const other = await fetch(`${srv.base}/repo/stable/main/amd64/foo_1.2.deb?repo=other`, { headers: authed });
    assert.strictEqual(other.status, 404);
    const up = await upload(srv, debs["1.2"], "other");
    assert.strictEqual(up.status, 201);
    const found = await fetch(`${srv.base}/repo/stable/main/amd64/foo_1.2.deb?repo=other`, { headers: authed });
    assert.strictEqual(found.status, 200);
    await found.arrayBuffer();
    await fetch(`${srv.base}/api/v1/packages/other/stable/main/amd64/foo/1.2`, { method: "DELETE", headers: authed });
  });

  it("metrics report real upload and download bytes", async () => {
    const text = await (await fetch(`${srv.base}/metrics`)).text();
    const up = Number(/pository_upload_bytes_total (\d+)/.exec(text)![1]);
    const down = Number(/pository_download_bytes_total (\d+)/.exec(text)![1]);
    assert.ok(up >= Object.values(debs).reduce((a, b) => a + b.length, 0));
    assert.ok(down >= debs["1.2"].length);
  });

  it("health endpoints work with a query string and no auth", async () => {
    const res = await fetch(`${srv.base}/healthz?x=1`);
    assert.strictEqual(res.status, 200);
  });

  it("apt Packages is cached, includes md5, and refreshes after an upload", async () => {
    const url = `${srv.base}/apt/default/dists/stable/main/binary-amd64/Packages`;
    const first = await (await fetch(url)).text();
    assert.ok(first.includes("Package: foo"));
    assert.ok(first.includes("Package: bar")); // arch all included
    assert.ok(first.includes(`MD5sum: ${crypto.createHash("md5").update(debs["1.2"]).digest("hex")}`));
    assert.strictEqual(await (await fetch(url)).text(), first);

    const gz = Buffer.from(await (await fetch(`${url}.gz`)).arrayBuffer());
    assert.strictEqual(zlib.gunzipSync(gz).toString(), first);

    const rel1 = await (await fetch(`${srv.base}/apt/default/dists/stable/Release`)).text();
    const sha = crypto.createHash("sha256").update(first).digest("hex");
    assert.ok(rel1.includes(`${sha} ${Buffer.byteLength(first)} main/binary-amd64/Packages`));

    const up = await upload(srv, buildDeb("baz", "1.0"));
    assert.strictEqual(up.status, 201);
    const second = await (await fetch(url)).text();
    assert.ok(second.includes("Package: baz"));
    const rel2 = await (await fetch(`${srv.base}/apt/default/dists/stable/Release`)).text();
    assert.notStrictEqual(rel2, rel1);
    await fetch(`${srv.base}/api/v1/packages/default/stable/main/amd64/baz/1.0`, { method: "DELETE", headers: authed });
    const third = await (await fetch(url)).text();
    assert.ok(!third.includes("Package: baz"));
  });

  it("prune validates keepLastN", async () => {
    for (const bad of [0, -1, 1.5, "2", undefined, null]) {
      const r = await prune(srv, { keepLastN: bad });
      assert.strictEqual(r.status, 400, JSON.stringify(bad));
    }
  });

  it("prune requires admin", async () => {
    const created = await fetch(`${srv.base}/api/v1/keys`, {
      method: "POST",
      headers: { ...authed, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "write" }),
    });
    const key = ((await created.json()) as any).key;
    const res = await fetch(`${srv.base}/api/v1/packages/prune`, {
      method: "POST",
      headers: { "X-Api-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ keepLastN: 1 }),
    });
    assert.strictEqual(res.status, 403);
  });

  it("prune dryRun lists victims without deleting, then really deletes", async () => {
    const dry = await prune(srv, { keepLastN: 2, name: "foo", dryRun: true });
    assert.strictEqual(dry.status, 200);
    assert.strictEqual(dry.data.dryRun, true);
    // newest two by dpkg ordering: 1.10, 1.9 ; victims: 1.2, 1.0~rc1
    assert.deepStrictEqual(dry.data.deleted.map((p: any) => p.version).sort(), ["1.0~rc1", "1.2"]);
    assert.strictEqual(dry.data.freedBytes, debs["1.2"].length + debs["1.0~rc1"].length);
    const still = await getJson(srv, "/api/v1/packages?name=foo");
    assert.strictEqual(still.data.packages.length, 4);

    const real = await prune(srv, { keepLastN: 2, name: "foo", repo: "default", distribution: "stable" });
    assert.strictEqual(real.data.dryRun, false);
    assert.strictEqual(real.data.deleted.length, 2);
    const after = await getJson(srv, "/api/v1/packages?name=foo");
    assert.deepStrictEqual(after.data.packages.map((p: any) => p.version).sort(), ["1.10", "1.9"]);
    // bar (name filter) untouched
    const bar = await getJson(srv, "/api/v1/packages?name=bar");
    assert.strictEqual(bar.data.packages.length, 1);
  });
});

describe("Retention", () => {
  let srv: TestServer;
  before(async () => {
    srv = await startServer(3096, "retention:\n  enabled: true\n  keepLastN: 2\n");
  });
  after(async () => srv.stop());

  it("prunes the group after each upload but never the version just uploaded", async () => {
    for (const v of ["2.0", "3.0", "4.0"]) {
      assert.strictEqual((await upload(srv, buildDeb("keeper", v))).status, 201);
    }
    let { data } = await getJson(srv, "/api/v1/packages?name=keeper");
    assert.deepStrictEqual(data.packages.map((p: any) => p.version).sort(), ["3.0", "4.0"]);

    // Uploading an old version: it is protected even though it is not in the newest 2
    assert.strictEqual((await upload(srv, buildDeb("keeper", "1.0"))).status, 201);
    ({ data } = await getJson(srv, "/api/v1/packages?name=keeper"));
    assert.deepStrictEqual(data.packages.map((p: any) => p.version).sort(), ["1.0", "3.0", "4.0"]);

    const info = await getJson(srv, "/api/v1/info");
    assert.deepStrictEqual(info.data.retention, { enabled: true, keepLastN: 2 });
  });
});

describe("Rate limiting", () => {
  let srv: TestServer;
  before(async () => {
    srv = await startServer(3095, "rateLimitMax: 5\n");
  });
  after(async () => srv.stop());

  it("exempts probes, metrics and apt", async () => {
    for (let i = 0; i < 15; i++) {
      assert.strictEqual((await fetch(`${srv.base}/healthz`)).status, 200);
      assert.strictEqual((await fetch(`${srv.base}/metrics`)).status, 200);
      assert.strictEqual((await fetch(`${srv.base}/apt/default/dists/stable/Release`)).status, 200);
    }
  });

  it("keys by authenticated identity", async () => {
    const created = await fetch(`${srv.base}/api/v1/keys`, {
      method: "POST",
      headers: { ...authed, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "read" }),
    });
    assert.strictEqual(created.status, 201);
    const key = ((await created.json()) as any).key;

    // Exhaust the admin key bucket
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) statuses.push((await fetch(`${srv.base}/api/v1/info`, { headers: authed })).status);
    assert.ok(statuses.includes(429), statuses.join());

    // A different identity from the same IP is unaffected
    assert.strictEqual((await fetch(`${srv.base}/api/v1/info`, { headers: { "X-Api-Key": key } })).status, 200);
  });

  it("trusts X-Forwarded-For from loopback for unauthenticated bucketing", async () => {
    // Different forwarded IPs do not share the failed-auth budget
    for (let i = 0; i < 7; i++) {
      const res = await fetch(`${srv.base}/api/v1/info`, { headers: { "X-Forwarded-For": `10.0.0.${i}` } });
      assert.strictEqual(res.status, 401);
    }
  });
});

describe("Overwrite policy", () => {
  describe("default-branch (default)", () => {
    let srv: TestServer;
    before(async () => {
      srv = await startServer(3097);
    });
    after(async () => srv.stop());

    it("treats a byte-identical re-upload as a no-op", async () => {
      const deb = buildDeb("same", "1.0");
      const first = await upload(srv, deb);
      assert.strictEqual(first.status, 201);
      const firstMeta: any = await first.json();
      const again = await upload(srv, deb);
      assert.strictEqual(again.status, 200);
      assert.strictEqual(again.headers.get("x-pository-unchanged"), "true");
      const againMeta: any = await again.json();
      assert.strictEqual(againMeta.uploadedAt, firstMeta.uploadedAt);
      assert.strictEqual(againMeta.sha256, firstMeta.sha256);
    });

    it("lets API-key uploads replace a version (they carry no git ref)", async () => {
      assert.strictEqual((await upload(srv, buildDeb("changing", "1.0", "amd64", " A"))).status, 201);
      const b = buildDeb("changing", "1.0", "amd64", " B");
      assert.strictEqual((await upload(srv, b)).status, 201);
      const { data } = await getJson(srv, "/api/v1/packages?name=changing");
      assert.strictEqual(data.packages.length, 1);
      assert.strictEqual(data.packages[0].sha256, crypto.createHash("sha256").update(b).digest("hex"));
    });
  });

  describe("reject", () => {
    let srv: TestServer;
    before(async () => {
      srv = await startServer(3098, "overwritePolicy: reject\n");
    });
    after(async () => srv.stop());

    it("refuses a changed re-upload with 409 and keeps the original", async () => {
      const a = buildDeb("frozen", "1.0", "amd64", " A");
      assert.strictEqual((await upload(srv, a)).status, 201);
      const res = await upload(srv, buildDeb("frozen", "1.0", "amd64", " B"));
      assert.strictEqual(res.status, 409);
      const body: any = await res.json();
      assert.match(body.error, /already exists/);
      assert.strictEqual(body.existingSha256, crypto.createHash("sha256").update(a).digest("hex"));
      const { data } = await getJson(srv, "/api/v1/packages?name=frozen");
      assert.strictEqual(data.packages[0].sha256, body.existingSha256);
      // identical bytes are still fine
      assert.strictEqual((await upload(srv, a)).status, 200);
    });
  });
});

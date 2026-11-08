import { FastifyInstance } from "fastify";
import { StorageService, PackageMetadata } from "../services/storage.js";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import zlib from "node:zlib";

interface AptRepoParams {
  repo: string;
  distribution: string;
}

interface AptComponentParams extends AptRepoParams {
  component: string;
  arch: string;
}

interface AptPoolParams {
  repo: string;
  distribution: string;
  component: string;
  arch: string;
  filename: string;
}

/**
 * Generate the apt-format Packages file content for a given set of packages.
 * Filename paths are relative to the repo base URL.
 */
async function generatePackagesContent(
  packages: PackageMetadata[],
  storage: StorageService
): Promise<string> {
  const entries: string[] = [];

  for (const pkg of packages) {
    // Compute the relative Filename for apt download
    const aptArch = pkg.architecture === "all" ? "all" : pkg.architecture;
    const filename = `pool/${pkg.distribution}/${pkg.component}/${aptArch}/${pkg.name}_${pkg.version}_${pkg.architecture}.deb`;

    // MD5 is computed at upload time (and lazily backfilled once for older entries).
    const md5 = (await storage.ensureMd5(pkg)) ?? "";

    const lines = [
      `Package: ${pkg.name}`,
      `Version: ${pkg.version}`,
      `Architecture: ${pkg.architecture}`,
    ];

    // Emit optional control fields stored at upload time, in the conventional
    // Packages-file order.
    if (pkg.maintainer) lines.push(`Maintainer: ${pkg.maintainer}`);

    // Emit Multi-Arch in the Packages index.
    //
    // The value emitted here must exactly match what dpkg will record in
    // /var/lib/dpkg/status when the package is installed.  dpkg copies the
    // Multi-Arch field from the deb's own control file (or from the Packages
    // index) verbatim into the status database.
    //
    // Rule: only emit Multi-Arch when the deb's control file explicitly
    // declares it (stored in pkg.multiArch at upload time).  Do NOT synthesise
    // a Multi-Arch value for any package.  If a synthetic value is added here
    // but the deb doesn't carry the same field, dpkg will record the synthetic
    // value in its status the first time the package is installed, and then
    // subsequent apt runs will see a mismatch between the Packages-file entry
    // (which no longer has the synthetic value) and the status entry (which
    // does), causing the package to appear perpetually "upgradeable".
    if (pkg.multiArch) {
      lines.push(`Multi-Arch: ${pkg.multiArch}`);
    }

    if (pkg.homepage) lines.push(`Homepage: ${pkg.homepage}`);
    if (pkg.section) lines.push(`Section: ${pkg.section}`);
    if (pkg.priority) lines.push(`Priority: ${pkg.priority}`);
    if (pkg.preDepends) lines.push(`Pre-Depends: ${pkg.preDepends}`);
    if (pkg.depends) lines.push(`Depends: ${pkg.depends}`);
    if (pkg.suggests) lines.push(`Suggests: ${pkg.suggests}`);
    if (pkg.conflicts) lines.push(`Conflicts: ${pkg.conflicts}`);
    if (pkg.breaks) lines.push(`Breaks: ${pkg.breaks}`);
    if (pkg.replaces) lines.push(`Replaces: ${pkg.replaces}`);
    if (pkg.provides) lines.push(`Provides: ${pkg.provides}`);

    // Only emit Installed-Size if the deb's control explicitly declared it.
    // A synthetic size computed from the download size would diverge from what
    // dpkg/status stores (which comes from the deb itself), causing a version
    // hash mismatch in apt and making the package appear perpetually upgradeable.
    if (pkg.installedSize != null) {
      lines.push(`Installed-Size: ${pkg.installedSize}`);
    }

    lines.push(
      `Filename: ${filename}`,
      `Size: ${pkg.size}`,
      `SHA256: ${pkg.sha256}`,
    );

    if (md5) {
      lines.push(`MD5sum: ${md5}`);
    }

    // Use the real description from the control file if available, otherwise
    // fall back to a minimal synthetic description.
    // Normalise continuation lines: apt requires exactly one leading space.
    // dpkg -I may return two spaces (the control file format uses one space but
    // dpkg's output indents once more for display).
    const rawDesc = pkg.description ?? `${pkg.name} ${pkg.version}`;
    const description = rawDesc
      .split("\n")
      .map((line, i) =>
        i === 0 ? line : " " + line.replace(/^\s*/, "")
      )
      .join("\n");
    lines.push(`Description: ${description}`);
    const descMd5 = crypto.createHash("md5").update(description + "\n").digest("hex");
    lines.push(`Description-md5: ${descMd5}`);

    entries.push(lines.join("\n"));
  }

  return entries.length > 0 ? entries.join("\n\n") + "\n\n" : "";
}

interface PackagesEntry {
  buf: Buffer;
  gz: Buffer;
}

// In-memory caches of generated apt indexes. Each entry records the repo
// revision it was built from and is rebuilt once the repo's index changes
// (upload / delete / prune).
const aptCache = new Map<string, { rev: number; value: Promise<unknown> }>();

function cached<T>(storage: StorageService, repo: string, key: string, build: () => Promise<T>): Promise<T> {
  const rev = storage.getRepoRevision(repo);
  const hit = aptCache.get(key);
  if (hit && hit.rev === rev) return hit.value as Promise<T>;
  const value = build();
  aptCache.set(key, { rev, value });
  value.catch(() => {
    if (aptCache.get(key)?.value === value) aptCache.delete(key);
  });
  return value;
}

function getPackagesEntry(
  storage: StorageService,
  repo: string,
  distribution: string,
  component: string,
  arch: string
): Promise<PackagesEntry> {
  return cached(storage, repo, `packages|${repo}|${distribution}|${component}|${arch}`, async () => {
    // Each Packages index contains packages for the requested arch AND
    // Architecture:all packages (matching real Debian/Ubuntu repos).  This
    // allows apt to merge installed dpkg/status records with the repo entries
    // and not show arch=all packages as perpetually upgradeable.
    const packages = storage
      .listPackages({ repo, distribution, component })
      .filter((p) => p.architecture === arch || p.architecture === "all");
    const buf = Buffer.from(await generatePackagesContent(packages, storage), "utf-8");
    return { buf, gz: zlib.gzipSync(buf) };
  });
}

/**
 * Generate a minimal apt Release file listing available components and
 * hashes for every Packages file under this distribution.
 */
async function generateReleaseContent(
  repo: string,
  distribution: string,
  packages: PackageMetadata[],
  storage: StorageService
): Promise<string> {
  // Collect distinct component/arch pairs
  const pairs = new Set<string>();
  for (const pkg of packages) {
    pairs.add(`${pkg.component}/${pkg.architecture}`);
  }

  const components = Array.from(new Set(packages.map((p) => p.component)));

  // Build all distinct arch sets: native-arch + "all"
  const archSet = new Set<string>();
  for (const pkg of packages) {
    if (pkg.architecture !== "all") archSet.add(pkg.architecture);
  }
  archSet.add("amd64"); // always include amd64
  const architectures = Array.from(archSet);

  const now = new Date().toUTCString();

  const hashLines: string[] = [];

  // For every component × binary arch, generate the Packages content and compute checksums
  for (const component of components) {
    // Packages that belong to this component and match the exact arch.
    // Architecture:all packages are included in each binary-{arch}/Packages file
    // (same as real Debian/Ubuntu repos) so that apt can merge the installed
    // dpkg/status record with the repo Packages entry.  Without this, apt keeps
    // the records separate and reports every arch=all package as "upgradeable"
    // even when the installed version already matches.
    for (const arch of architectures) {
      const entry = await getPackagesEntry(storage, repo, distribution, component, arch);
      if (entry.buf.length === 0) continue;

      const buf = entry.buf;
      const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
      const md5 = crypto.createHash("md5").update(buf).digest("hex");
      const size = buf.length;
      const relPath = `${component}/binary-${arch}/Packages`;
      hashLines.push(` ${md5} ${size} ${relPath}`);
      hashLines.push(` ${sha256} ${size} ${relPath} (SHA256)`);
    }

    // Architecture:all packages are included in each binary-{arch}/Packages
    // above.  Do NOT generate a separate binary-all/Packages — that would cause
    // apt to see arch=all packages from two sources and report them as
    // perpetually upgradeable (the original issue #5).
  }

  // Separate MD5Sum and SHA256 sections properly
  const md5Lines = hashLines.filter((l) => !l.includes("(SHA256)"));
  const sha256Lines = hashLines
    .filter((l) => l.includes("(SHA256)"))
    .map((l) => l.replace(" (SHA256)", ""));

  return [
    `Origin: Pository`,
    `Label: Pository`,
    `Suite: ${distribution}`,
    `Codename: pository-${repo}-${distribution}`,
    `Date: ${now}`,
    `Architectures: ${architectures.join(" ")}`,
    `Components: ${components.join(" ")}`,
    `Description: Pository repository for ${repo}`,
    `MD5Sum:`,
    ...md5Lines,
    `SHA256:`,
    ...sha256Lines,
  ].join("\n") + "\n";
}

export function registerAptRoutes(
  app: FastifyInstance,
  storage: StorageService,
  dataRoot: string
): void {
  // Release file (unsigned) — no auth required
  app.get<{ Params: AptRepoParams }>(
    "/apt/:repo/dists/:distribution/Release",
    async (request, reply) => {
      const { repo, distribution } = request.params;

      const content = await cached(storage, repo, `release|${repo}|${distribution}`, () =>
        generateReleaseContent(repo, distribution, storage.listPackages({ repo, distribution }), storage)
      );

      reply
        .header("Content-Type", "text/plain; charset=utf-8")
        .send(content);
    }
  );

  // Packages index — no auth required
  app.get<{ Params: AptComponentParams }>(
    "/apt/:repo/dists/:distribution/:component/binary-:arch/Packages",
    async (request, reply) => {
      const { repo, distribution, component, arch } = request.params;
      const entry = await getPackagesEntry(storage, repo, distribution, component, arch);

      reply
        .header("Content-Type", "text/plain; charset=utf-8")
        .send(entry.buf);
    }
  );

  // Packages.gz — no auth required
  app.get<{ Params: AptComponentParams }>(
    "/apt/:repo/dists/:distribution/:component/binary-:arch/Packages.gz",
    async (request, reply) => {
      const { repo, distribution, component, arch } = request.params;
      const entry = await getPackagesEntry(storage, repo, distribution, component, arch);

      reply
        .header("Content-Type", "application/gzip")
        .send(entry.gz);
    }
  );

  // Pool download — no auth required (public package download for apt)
  app.get<{ Params: AptPoolParams }>(
    "/apt/:repo/pool/:distribution/:component/:arch/:filename",
    async (request, reply) => {
      const { repo, distribution, component, arch, filename } = request.params;

      // Parse filename: name_version_arch.deb
      const match = filename.match(/^(.+?)_(.+?)_(.+?)\.deb$/);
      if (!match) {
        reply.code(400).send({ error: "Invalid filename format" });
        return;
      }

      const [, name, version] = match;

      const debPath = path.join(
        dataRoot,
        repo,
        distribution,
        component,
        arch,
        name,
        version,
        "package.deb"
      );

      if (!fs.existsSync(debPath)) {
        reply.code(404).send({ error: "Package not found" });
        return;
      }

      const size = fs.statSync(debPath).size;
      reply.header("Content-Type", "application/vnd.debian.binary-package");
      reply.header("Content-Length", size);
      reply.header(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );
      request.trackedBytes = { bytes: size, upload: false };

      const stream = fs.createReadStream(debPath);
      return reply.send(stream);
    }
  );
}

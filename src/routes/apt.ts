import { FastifyInstance } from "fastify";
import { StorageService, PackageMetadata } from "../services/storage.js";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";

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
function generatePackagesContent(
  packages: PackageMetadata[],
  dataRoot: string
): string {
  const entries: string[] = [];

  for (const pkg of packages) {
    const debPath = path.join(
      dataRoot,
      pkg.repo,
      pkg.distribution,
      pkg.component,
      pkg.architecture,
      pkg.name,
      pkg.version,
      "package.deb"
    );

    // Compute the relative Filename for apt download
    const aptArch = pkg.architecture === "all" ? "all" : pkg.architecture;
    const filename = `pool/${pkg.distribution}/${pkg.component}/${aptArch}/${pkg.name}_${pkg.version}_${pkg.architecture}.deb`;

    // Compute installed size (approximate: size / 1024 KB, minimum 4)
    const installedSizeKb = Math.max(4, Math.ceil(pkg.size / 1024));

    // Try to read MD5 from the stored file
    let md5 = "";
    try {
      const buf = fs.readFileSync(debPath);
      md5 = crypto.createHash("md5").update(buf).digest("hex");
    } catch {
      // skip MD5 if file unreadable
    }

    const lines = [
      `Package: ${pkg.name}`,
      `Version: ${pkg.version}`,
      `Architecture: ${pkg.architecture}`,
      `Installed-Size: ${installedSizeKb}`,
      `Filename: ${filename}`,
      `Size: ${pkg.size}`,
      `SHA256: ${pkg.sha256}`,
    ];

    if (md5) {
      lines.push(`MD5sum: ${md5}`);
    }

    lines.push(`Description: ${pkg.name} ${pkg.version}`);

    entries.push(lines.join("\n"));
  }

  return entries.length > 0 ? entries.join("\n\n") + "\n\n" : "";
}

/**
 * Generate a minimal apt Release file listing available components and
 * hashes for every Packages file under this distribution.
 */
function generateReleaseContent(
  repo: string,
  distribution: string,
  packages: PackageMetadata[],
  dataRoot: string
): string {
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
    // Packages that belong to this component and can be served for any arch
    // (includes arch-specific and arch=all)
    for (const arch of architectures) {
      const pkgsForArch = packages.filter(
        (p) =>
          p.component === component &&
          (p.architecture === arch || p.architecture === "all")
      );
      if (pkgsForArch.length === 0) continue;

      const content = generatePackagesContent(pkgsForArch, dataRoot);
      const buf = Buffer.from(content, "utf-8");
      const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
      const md5 = crypto.createHash("md5").update(buf).digest("hex");
      const size = buf.length;
      const relPath = `${component}/binary-${arch}/Packages`;
      hashLines.push(` ${md5} ${size} ${relPath}`);
      hashLines.push(` ${sha256} ${size} ${relPath} (SHA256)`);
    }

    // Also generate a binary-all Packages
    const pkgsAll = packages.filter(
      (p) => p.component === component && p.architecture === "all"
    );
    if (pkgsAll.length > 0) {
      const content = generatePackagesContent(pkgsAll, dataRoot);
      const buf = Buffer.from(content, "utf-8");
      const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
      const md5 = crypto.createHash("md5").update(buf).digest("hex");
      const size = buf.length;
      const relPath = `${component}/binary-all/Packages`;
      hashLines.push(` ${md5} ${size} ${relPath}`);
      hashLines.push(` ${sha256} ${size} ${relPath} (SHA256)`);
    }
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
    `Codename: ${distribution}`,
    `Date: ${now}`,
    `Architectures: ${architectures.join(" ")} all`,
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

      const packages = storage.listPackages({ repo, distribution });

      if (packages.length === 0) {
        // Still produce a valid (empty) Release for the distribution
      }

      const content = generateReleaseContent(repo, distribution, packages, dataRoot);

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

      // Include both arch-specific and arch=all packages
      const packages = storage
        .listPackages({ repo, distribution, component })
        .filter((p) => p.architecture === arch || p.architecture === "all");

      const content = generatePackagesContent(packages, dataRoot);

      reply
        .header("Content-Type", "text/plain; charset=utf-8")
        .send(content);
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

      reply.header("Content-Type", "application/vnd.debian.binary-package");
      reply.header(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );

      const stream = fs.createReadStream(debPath);
      return reply.send(stream);
    }
  );
}

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { execFileSync } from "node:child_process";

export interface PackageMetadata {
  name: string;
  version: string;
  architecture: string;
  size: number;
  sha256: string;
  mime: string;
  uploadedAt: string;
  uploaderKeyId: string;
  repo: string;
  distribution: string;
  component: string;
  // Optional fields extracted from the deb control file at upload time.
  // Stored so the apt Packages index can serve accurate metadata.
  description?: string;
  multiArch?: string;
  maintainer?: string;
  depends?: string;
  homepage?: string;
  section?: string;
  priority?: string;
  // Installed-Size from the deb control file (in kibibytes), if present.
  // Only stored when the deb's control explicitly declares it, so we don't
  // emit a synthetic value that would diverge from dpkg/status.
  installedSize?: number;
  // Additional relationship and metadata fields from the deb control file.
  // Pre-Depends, Conflicts, Breaks, Replaces are all apt VersionHash-relevant;
  // Suggests and Provides are included for completeness.
  preDepends?: string;
  suggests?: string;
  conflicts?: string;
  breaks?: string;
  replaces?: string;
  provides?: string;
}

export interface PackageLocation {
  repo: string;
  distribution: string;
  component: string;
  architecture: string;
  name: string;
  version: string;
}

export interface PackageIndex {
  packages: PackageMetadata[];
}

/** The subset of PackageMetadata that originates from the deb's control file. */
export type DebControlMeta = Pick<PackageMetadata,
  "description" | "multiArch" | "maintainer" | "depends" | "preDepends" |
  "suggests" | "conflicts" | "breaks" | "replaces" | "provides" |
  "homepage" | "section" | "priority" | "installedSize">;

export class StorageService {
  private dataRoot: string;
  private indexCache: Map<string, PackageIndex> = new Map();

  constructor(dataRoot: string) {
    this.dataRoot = dataRoot;
    if (!fs.existsSync(dataRoot)) {
      fs.mkdirSync(dataRoot, { recursive: true });
    }
  }

  private getPackagePath(loc: PackageLocation): string {
    return path.join(
      this.dataRoot,
      loc.repo,
      loc.distribution,
      loc.component,
      loc.architecture,
      loc.name,
      loc.version
    );
  }

  private getIndexPath(repo: string): string {
    return path.join(this.dataRoot, repo, "index.json");
  }

  /**
   * Load (and cache) the package index for a repo.
   *
   * On first load, any entries whose `description` field is missing are
   * healed by reading the corresponding .deb with `dpkg-deb`.  This makes
   * the service self-repairing: packages uploaded before control-metadata
   * extraction was implemented are transparently back-filled the first time
   * the index is accessed after a service restart — no manual migration
   * scripts are needed.
   */
  private loadIndex(repo: string): PackageIndex {
    const cached = this.indexCache.get(repo);
    if (cached) return cached;

    const indexPath = this.getIndexPath(repo);
    if (fs.existsSync(indexPath)) {
      const content = fs.readFileSync(indexPath, "utf-8");
      const index = JSON.parse(content) as PackageIndex;

      // Self-heal: backfill control fields from .deb for any entries that
      // pre-date the upload-time extraction logic.
      let healed = false;
      for (let i = 0; i < index.packages.length; i++) {
        const pkg = index.packages[i];
        if (!pkg.description) {
          const debPath = path.join(this.getPackagePath(pkg), "package.deb");
          const fields = this.extractDebControl(debPath);
          if (fields) {
            index.packages[i] = { ...pkg, ...fields };
            try {
              const metaPath = path.join(this.getPackagePath(pkg), "metadata.json");
              fs.writeFileSync(metaPath, JSON.stringify(index.packages[i], null, 2));
            } catch { /* best-effort */ }
            healed = true;
          }
        }
      }

      if (healed) {
        this.saveIndex(repo, index);
      } else {
        this.indexCache.set(repo, index);
      }
      return index;
    }

    const index: PackageIndex = { packages: [] };
    this.indexCache.set(repo, index);
    return index;
  }

  private saveIndex(repo: string, index: PackageIndex): void {
    const indexPath = this.getIndexPath(repo);
    const dir = path.dirname(indexPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
    this.indexCache.set(repo, index);
  }

  async storePackage(
    loc: PackageLocation,
    fileBuffer: Buffer,
    uploaderKeyId: string,
    controlExtra?: Partial<DebControlMeta>
  ): Promise<PackageMetadata> {
    const pkgPath = this.getPackagePath(loc);
    const debPath = path.join(pkgPath, "package.deb");
    const metaPath = path.join(pkgPath, "metadata.json");

    // Create directory
    if (!fs.existsSync(pkgPath)) {
      fs.mkdirSync(pkgPath, { recursive: true });
    }

    // Compute SHA256
    const sha256 = crypto.createHash("sha256").update(fileBuffer).digest("hex");

    // Write file
    await pipeline(Readable.from(fileBuffer), fs.createWriteStream(debPath));

    // If the built-in control parser could not extract metadata (e.g. for
    // xz/zstd-compressed control archives), fall back to dpkg-deb on the
    // file we just wrote.  This ensures every upload stores complete metadata
    // without requiring an external backfill step.
    let resolvedExtra = controlExtra;
    if (!resolvedExtra?.description) {
      const extracted = this.extractDebControl(debPath);
      if (extracted) {
        resolvedExtra = { ...resolvedExtra, ...extracted };
      }
    }

    // Create metadata
    const metadata: PackageMetadata = {
      name: loc.name,
      version: loc.version,
      architecture: loc.architecture,
      size: fileBuffer.length,
      sha256,
      mime: "application/vnd.debian.binary-package",
      uploadedAt: new Date().toISOString(),
      uploaderKeyId,
      repo: loc.repo,
      distribution: loc.distribution,
      component: loc.component,
      ...resolvedExtra,
    };

    // Write metadata
    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));

    // Update index
    const index = this.loadIndex(loc.repo);
    const existingIdx = index.packages.findIndex(
      (p) =>
        p.name === loc.name &&
        p.version === loc.version &&
        p.distribution === loc.distribution &&
        p.component === loc.component &&
        p.architecture === loc.architecture
    );

    if (existingIdx >= 0) {
      index.packages[existingIdx] = metadata;
    } else {
      index.packages.push(metadata);
    }
    this.saveIndex(loc.repo, index);

    return metadata;
  }

  getPackageFile(loc: PackageLocation): string | null {
    const pkgPath = this.getPackagePath(loc);
    const debPath = path.join(pkgPath, "package.deb");
    if (fs.existsSync(debPath)) {
      return debPath;
    }
    return null;
  }

  getPackageMetadata(loc: PackageLocation): PackageMetadata | null {
    const pkgPath = this.getPackagePath(loc);
    const metaPath = path.join(pkgPath, "metadata.json");
    if (fs.existsSync(metaPath)) {
      const content = fs.readFileSync(metaPath, "utf-8");
      return JSON.parse(content);
    }
    return null;
  }

  deletePackage(loc: PackageLocation): boolean {
    const pkgPath = this.getPackagePath(loc);
    if (!fs.existsSync(pkgPath)) {
      return false;
    }

    // Remove directory recursively
    fs.rmSync(pkgPath, { recursive: true });

    // Update index
    const index = this.loadIndex(loc.repo);
    const idx = index.packages.findIndex(
      (p) =>
        p.name === loc.name &&
        p.version === loc.version &&
        p.distribution === loc.distribution &&
        p.component === loc.component &&
        p.architecture === loc.architecture
    );
    if (idx >= 0) {
      index.packages.splice(idx, 1);
      this.saveIndex(loc.repo, index);
    }

    // Clean up empty parent directories
    this.cleanEmptyDirs(path.dirname(pkgPath));

    return true;
  }

  /**
   * Extract control-file metadata from a .deb using dpkg-deb.
   * Returns null if dpkg-deb is not available or the file is unreadable.
   */
  private extractDebControl(debPath: string): Partial<DebControlMeta> | null {
    if (!fs.existsSync(debPath)) return null;
    try {
      const raw = execFileSync("dpkg-deb", ["--field", debPath], {
        encoding: "utf-8",
        timeout: 15_000,
      });

      // Parse field output — same key: value format as DEBIAN/control.
      const fields: Record<string, string> = {};
      let key = "";
      for (const line of raw.split("\n")) {
        if (line.startsWith(" ") || line.startsWith("\t")) {
          if (key) fields[key] += "\n" + line;
        } else {
          const colon = line.indexOf(": ");
          if (colon > 0) {
            key = line.substring(0, colon);
            fields[key] = line.substring(colon + 2);
          }
        }
      }

      const result: Partial<DebControlMeta> = {};
      if (fields.Description) result.description = fields.Description.trimEnd();
      if (fields["Multi-Arch"]) result.multiArch = fields["Multi-Arch"];
      if (fields.Maintainer) result.maintainer = fields.Maintainer;
      if (fields.Depends) result.depends = fields.Depends;
      if (fields["Pre-Depends"]) result.preDepends = fields["Pre-Depends"];
      if (fields.Suggests) result.suggests = fields.Suggests;
      if (fields.Conflicts) result.conflicts = fields.Conflicts;
      if (fields.Breaks) result.breaks = fields.Breaks;
      if (fields.Replaces) result.replaces = fields.Replaces;
      if (fields.Provides) result.provides = fields.Provides;
      if (fields.Homepage) result.homepage = fields.Homepage;
      if (fields.Section) result.section = fields.Section;
      if (fields.Priority) result.priority = fields.Priority;
      if (fields["Installed-Size"]) {
        const parsed = parseInt(fields["Installed-Size"], 10);
        if (!isNaN(parsed)) result.installedSize = parsed;
      }
      return result;
    } catch {
      return null;
    }
  }

  private cleanEmptyDirs(dir: string): void {
    while (dir !== this.dataRoot && dir.startsWith(this.dataRoot)) {
      try {
        const entries = fs.readdirSync(dir);
        if (entries.length === 0) {
          fs.rmdirSync(dir);
          dir = path.dirname(dir);
        } else {
          break;
        }
      } catch {
        break;
      }
    }
  }

  listPackages(filters: {
    repo?: string;
    distribution?: string;
    component?: string;
    architecture?: string;
    name?: string;
    version?: string;
  }): PackageMetadata[] {
    const results: PackageMetadata[] = [];

    // Get repos to search
    const repos = filters.repo
      ? [filters.repo]
      : this.listRepos();

    for (const repo of repos) {
      const index = this.loadIndex(repo);
      for (const pkg of index.packages) {
        if (filters.distribution && pkg.distribution !== filters.distribution) continue;
        if (filters.component && pkg.component !== filters.component) continue;
        if (filters.architecture && pkg.architecture !== filters.architecture) continue;
        if (filters.name && pkg.name !== filters.name) continue;
        if (filters.version && pkg.version !== filters.version) continue;
        results.push(pkg);
      }
    }

    return results;
  }

  private listRepos(): string[] {
    if (!fs.existsSync(this.dataRoot)) {
      return [];
    }
    return fs.readdirSync(this.dataRoot).filter((entry) => {
      const stat = fs.statSync(path.join(this.dataRoot, entry));
      return stat.isDirectory();
    });
  }

  getStorageStats(): { totalSize: number; packageCount: number } {
    let totalSize = 0;
    let packageCount = 0;

    for (const repo of this.listRepos()) {
      const index = this.loadIndex(repo);
      for (const pkg of index.packages) {
        totalSize += pkg.size;
        packageCount++;
      }
    }

    return { totalSize, packageCount };
  }

  isStorageReady(): boolean {
    try {
      fs.accessSync(this.dataRoot, fs.constants.R_OK | fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }
}

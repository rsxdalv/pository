import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { EventEmitter } from "node:events";

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

export class StorageService {
  private dataRoot: string;
  private indexCache: Map<string, PackageIndex> = new Map();
  public events: EventEmitter = new EventEmitter();

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

  private loadIndex(repo: string): PackageIndex {
    const cached = this.indexCache.get(repo);
    if (cached) return cached;

    const indexPath = this.getIndexPath(repo);
    if (fs.existsSync(indexPath)) {
      const content = fs.readFileSync(indexPath, "utf-8");
      const index = JSON.parse(content) as PackageIndex;
      this.indexCache.set(repo, index);
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
    uploaderKeyId: string
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

    // Notify listeners that the index changed for this repo
    try {
      this.events.emit("indexChanged", { repo: loc.repo, distribution: loc.distribution });
    } catch {
      // no-op
    }

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

    try {
      this.events.emit("indexChanged", { repo: loc.repo, distribution: loc.distribution });
    } catch {}

    return true;
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

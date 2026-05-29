import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { dirname } from "path";

export type OidcOverridesMap = Record<string, string[]>;

export class OidcOverridesService {
  private filePath: string;
  private overrides: OidcOverridesMap = {};

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async load(): Promise<void> {
    if (!existsSync(this.filePath)) {
      this.overrides = {};
      return;
    }
    const raw = await readFile(this.filePath, "utf8");
    this.overrides = JSON.parse(raw);
  }

  private async save(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.overrides, null, 2));
  }

  getAll(): OidcOverridesMap {
    return { ...this.overrides };
  }

  async upsert(repo: string, packages: string[]): Promise<void> {
    this.overrides[repo] = packages;
    await this.save();
  }

  async remove(repo: string): Promise<void> {
    delete this.overrides[repo];
    await this.save();
  }
}

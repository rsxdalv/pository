/**
 * One-shot migration: read every stored package.deb, extract control fields
 * (Description, Multi-Arch, Maintainer, Depends, Homepage, Section, Priority)
 * and write them into the corresponding metadata.json.  Also rebuilds index.json
 * so the running service serves the updated metadata immediately.
 *
 * Uses `dpkg -f` which supports all compression formats (gz, xz, zst).
 *
 * Usage: node scripts/backfill-metadata.mjs [dataRoot]
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const dataRoot = process.argv[2] ?? "/var/lib/pository";

function dpkgField(debPath, field) {
  try {
    return execSync(`dpkg -f "${debPath}" ${field}`, { encoding: "utf-8" }).trim();
  } catch {
    return "";
  }
}

function dpkgDescription(debPath) {
  // dpkg -I gives us the full multi-line description
  try {
    const out = execSync(`dpkg -I "${debPath}"`, { encoding: "utf-8" });
    const match = out.match(/Description: (.+(?:\n .+)*)/);
    if (match) return match[1].replace(/\n /g, "\n ").trimEnd();
  } catch { /* ignore */ }
  return "";
}

const debs = fs.readdirSync(dataRoot, { recursive: true })
  .filter(f => f.toString().endsWith("package.deb"));

let total = 0, updated = 0, skipped = 0;

for (const rel of debs) {
  const debPath = path.join(dataRoot, rel.toString());
  const metaPath = debPath.replace("package.deb", "metadata.json");
  if (!fs.existsSync(metaPath)) { skipped++; continue; }

  const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
  total++;

  // (re-run even if we previously backfilled, to fix any bad multiArch values)

  const description = dpkgDescription(debPath);
  // dpkg -f returns 'no' for Multi-Arch if the field is absent, but the field
  // should only be stored in metadata when it is explicitly declared in the deb.
  const multiArch = dpkgField(debPath, "Multi-Arch");
  const multiArchExplicit = (() => {
    try {
      const info = execSync(`dpkg-deb --info "${debPath}"`, { encoding: "utf-8" });
      return /^\s+Multi-Arch:/im.test(info);
    } catch { return false; }
  })();
  const maintainer = dpkgField(debPath, "Maintainer");
  const depends = dpkgField(debPath, "Depends");
  const homepage = dpkgField(debPath, "Homepage");
  const section = dpkgField(debPath, "Section");
  const priority = dpkgField(debPath, "Priority");
  // Only store Installed-Size when the deb control explicitly declares it.
  const installedSizeRaw = dpkgField(debPath, "Installed-Size");

  if (description) meta.description = description;
  if (multiArchExplicit && multiArch) meta.multiArch = multiArch;
  else delete meta.multiArch; // remove any previously-written incorrect value
  if (maintainer) meta.maintainer = maintainer;
  if (depends) meta.depends = depends;
  if (homepage) meta.homepage = homepage;
  if (section) meta.section = section;
  if (priority) meta.priority = priority;
  if (installedSizeRaw) {
    const parsed = parseInt(installedSizeRaw, 10);
    if (!isNaN(parsed)) meta.installedSize = parsed;
  } else {
    delete meta.installedSize; // remove synthetic value if present
  }

  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  updated++;
  console.log(`Updated ${meta.name} ${meta.version}: "${description.split("\n")[0]}"`);
}
// Rebuild every index.json from fresh metadata files
const repos = fs.readdirSync(dataRoot).filter(
  r => fs.statSync(path.join(dataRoot, r)).isDirectory()
);
for (const repo of repos) {
  const indexPath = path.join(dataRoot, repo, "index.json");
  if (!fs.existsSync(indexPath)) continue;

  const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
  let changed = false;
  for (let i = 0; i < index.packages.length; i++) {
    const p = index.packages[i];
    const metaPath = path.join(
      dataRoot, p.repo, p.distribution, p.component,
      p.architecture, p.name, p.version, "metadata.json"
    );
    if (!fs.existsSync(metaPath)) continue;
    const fresh = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    if (JSON.stringify(fresh) !== JSON.stringify(p)) {
      index.packages[i] = fresh;
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
    console.log(`Rebuilt index for repo: ${repo}`);
  }
}

console.log(`\nDone. Processed ${total}, updated ${updated}, skipped ${skipped}.`);
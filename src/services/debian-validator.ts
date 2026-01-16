export interface DebianControlData {
  Package?: string;
  Version?: string;
  Architecture?: string;
  [key: string]: string | undefined;
}

/**
 * Validates that a buffer contains a valid Debian package (ar archive)
 * and extracts control data.
 * 
 * Note: Control data extraction supports gzip-compressed control.tar files.
 * xz and zstd compressed control files are validated but metadata extraction
 * is skipped (package name/version must be provided via filename or form fields).
 */
export async function validateDebianPackage(
  buffer: Buffer
): Promise<{ valid: boolean; control?: DebianControlData; error?: string }> {
  // Check ar archive magic
  const arMagic = "!<arch>\n";
  if (buffer.length < 8 || buffer.subarray(0, 8).toString() !== arMagic) {
    return { valid: false, error: "Invalid ar archive: missing magic header" };
  }

  // Parse ar archive entries
  let offset = 8;
  const entries: { name: string; size: number; data: Buffer }[] = [];

  while (offset < buffer.length) {
    if (offset + 60 > buffer.length) break;

    const header = buffer.subarray(offset, offset + 60);
    const name = header.subarray(0, 16).toString().trim();
    const sizeStr = header.subarray(48, 58).toString().trim();
    const size = parseInt(sizeStr, 10);

    if (isNaN(size)) break;

    offset += 60;

    if (offset + size > buffer.length) break;

    const data = buffer.subarray(offset, offset + size);
    entries.push({ name, size, data });

    // Move to next entry (ar uses 2-byte alignment)
    offset += size;
    if (offset % 2 !== 0) offset++;
  }

  // Find debian-binary to confirm it's a deb
  const debianBinary = entries.find((e) => e.name === "debian-binary" || e.name.startsWith("debian-binary"));
  if (!debianBinary) {
    return { valid: false, error: "Not a Debian package: missing debian-binary" };
  }

  const version = debianBinary.data.toString().trim();
  if (!version.startsWith("2.")) {
    return { valid: false, error: `Unsupported Debian package format: ${version}` };
  }

  // Find control.tar (can be control.tar.gz, control.tar.xz, control.tar.zst)
  const controlEntry = entries.find(
    (e) =>
      e.name.startsWith("control.tar") ||
      e.name === "control.tar.gz" ||
      e.name === "control.tar.xz" ||
      e.name === "control.tar.zst"
  );

  if (!controlEntry) {
    return { valid: false, error: "Not a Debian package: missing control.tar" };
  }

  // Find data.tar
  const dataEntry = entries.find(
    (e) =>
      e.name.startsWith("data.tar") ||
      e.name === "data.tar.gz" ||
      e.name === "data.tar.xz" ||
      e.name === "data.tar.zst" ||
      e.name === "data.tar.bz2"
  );

  if (!dataEntry) {
    return { valid: false, error: "Not a Debian package: missing data.tar" };
  }

  // Try to extract control file
  const control = await extractControlFile(controlEntry.data, controlEntry.name);

  return { valid: true, control };
}

async function extractControlFile(
  data: Buffer,
  name: string
): Promise<DebianControlData | undefined> {
  try {
    let decompressed: Buffer;

    if (name.endsWith(".gz")) {
      const { gunzipSync } = await import("node:zlib");
      decompressed = gunzipSync(data);
    } else if (name.endsWith(".xz")) {
      // xz decompression requires external library (e.g., lzma-native)
      // Package is still valid, but metadata must be provided via filename or form fields
      return undefined;
    } else if (name.endsWith(".zst")) {
      // zstd decompression requires external library (e.g., @aspect-build/zstd)
      // Package is still valid, but metadata must be provided via filename or form fields
      return undefined;
    } else {
      decompressed = data;
    }

    // Parse tar to find ./control or control
    const controlData = extractFileFromTar(decompressed, "control");
    if (controlData) {
      return parseControlFile(controlData.toString());
    }
  } catch {
    // Control extraction failed, but package may still be valid
  }

  return undefined;
}

function extractFileFromTar(tarData: Buffer, filename: string): Buffer | null {
  let offset = 0;

  while (offset < tarData.length) {
    // Tar header is 512 bytes
    if (offset + 512 > tarData.length) break;

    const header = tarData.subarray(offset, offset + 512);

    // Check for empty block (end of archive)
    if (header.every((b) => b === 0)) break;

    const name = header.subarray(0, 100).toString().replace(/\0/g, "").trim();
    const sizeOctal = header.subarray(124, 136).toString().replace(/\0/g, "").trim();
    const size = parseInt(sizeOctal, 8) || 0;

    offset += 512;

    if (name === filename || name === `./${filename}`) {
      return tarData.subarray(offset, offset + size);
    }

    // Skip file data and padding to 512-byte boundary
    const blocks = Math.ceil(size / 512);
    offset += blocks * 512;
  }

  return null;
}

function parseControlFile(content: string): DebianControlData {
  const control: DebianControlData = {};
  const lines = content.split("\n");

  let currentKey = "";
  for (const line of lines) {
    if (line.startsWith(" ") || line.startsWith("\t")) {
      // Continuation of previous field
      if (currentKey) {
        control[currentKey] = (control[currentKey] || "") + "\n" + line;
      }
    } else {
      const colonIndex = line.indexOf(":");
      if (colonIndex > 0) {
        currentKey = line.substring(0, colonIndex);
        control[currentKey] = line.substring(colonIndex + 1).trim();
      }
    }
  }

  return control;
}

/**
 * Sanitizes a path component to prevent directory traversal
 */
export function sanitizePath(component: string): string {
  // Remove any path separators and parent directory references
  return component
    .replace(/[/\\]/g, "")
    .replace(/\.\./g, "")
    .replace(/^\.+/, "");
}

/**
 * Validates a Debian package name
 */
export function isValidPackageName(name: string): boolean {
  // Debian package names must start with alphanumeric and can contain
  // lowercase letters, digits, +, -, .
  return /^[a-z0-9][a-z0-9+.-]*$/i.test(name);
}

/**
 * Validates a Debian version string
 */
export function isValidVersion(version: string): boolean {
  // Simplified validation: alphanumeric with . - + : ~
  return /^[a-z0-9][a-z0-9.+~:-]*$/i.test(version);
}

/**
 * Validates an architecture string
 */
export function isValidArchitecture(arch: string): boolean {
  const validArches = [
    "all",
    "any",
    "amd64",
    "i386",
    "arm64",
    "armhf",
    "armel",
    "mips64el",
    "mipsel",
    "ppc64el",
    "riscv64",
    "s390x",
  ];
  return validArches.includes(arch.toLowerCase()) || /^[a-z][a-z0-9-]*$/.test(arch);
}

/**
 * Debian version comparison (dpkg algorithm, deb-version(7)).
 *
 * A version is [epoch:]upstream[-revision]. Epoch is numeric (default 0), the
 * revision is everything after the LAST hyphen. Upstream and revision are
 * compared by alternating non-digit / digit runs; within non-digit runs
 * letters sort before non-letters, and '~' sorts before everything,
 * including the end of the string.
 */

export interface ParsedDebianVersion {
  epoch: number;
  upstream: string;
  revision: string;
}

export function parseDebianVersion(version: string): ParsedDebianVersion {
  let rest = version.trim();
  let epoch = 0;

  const colon = rest.indexOf(":");
  if (colon > 0 && /^\d+$/.test(rest.slice(0, colon))) {
    epoch = parseInt(rest.slice(0, colon), 10);
    rest = rest.slice(colon + 1);
  }

  const hyphen = rest.lastIndexOf("-");
  if (hyphen >= 0) {
    return { epoch, upstream: rest.slice(0, hyphen), revision: rest.slice(hyphen + 1) };
  }
  return { epoch, upstream: rest, revision: "" };
}

function isDigit(c: string): boolean {
  return c >= "0" && c <= "9";
}

function isAlpha(c: string): boolean {
  return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");
}

/** Sort weight of a character in a non-digit run. */
function order(c: string | undefined): number {
  if (c === undefined || isDigit(c)) return 0;
  if (c === "~") return -1;
  if (isAlpha(c)) return c.charCodeAt(0);
  return c.charCodeAt(0) + 256;
}

function compareFragment(a: string, b: string): number {
  let i = 0;
  let j = 0;

  while (i < a.length || j < b.length) {
    // Non-digit prefix
    while ((i < a.length && !isDigit(a[i])) || (j < b.length && !isDigit(b[j]))) {
      const oa = order(i < a.length && !isDigit(a[i]) ? a[i] : undefined);
      const ob = order(j < b.length && !isDigit(b[j]) ? b[j] : undefined);
      if (oa !== ob) return oa < ob ? -1 : 1;
      if (i < a.length && !isDigit(a[i])) i++;
      if (j < b.length && !isDigit(b[j])) j++;
    }

    // Numeric run (compared as integers of arbitrary length)
    let si = i;
    while (si < a.length && a[si] === "0") si++;
    let sj = j;
    while (sj < b.length && b[sj] === "0") sj++;
    let ei = si;
    while (ei < a.length && isDigit(a[ei])) ei++;
    let ej = sj;
    while (ej < b.length && isDigit(b[ej])) ej++;

    const na = a.slice(si, ei);
    const nb = b.slice(sj, ej);
    if (na.length !== nb.length) return na.length < nb.length ? -1 : 1;
    if (na !== nb) return na < nb ? -1 : 1;

    i = ei;
    j = ej;
  }
  return 0;
}

/** Returns <0 if a < b, 0 if equal, >0 if a > b. */
export function compareDebianVersions(a: string, b: string): number {
  const pa = parseDebianVersion(a);
  const pb = parseDebianVersion(b);

  if (pa.epoch !== pb.epoch) return pa.epoch < pb.epoch ? -1 : 1;

  const up = compareFragment(pa.upstream, pb.upstream);
  if (up !== 0) return up;

  return compareFragment(pa.revision, pb.revision);
}

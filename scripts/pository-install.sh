#!/usr/bin/env bash
# pository-install.sh - Download and install a Debian package from a Pository instance
#
# Usage:
#   ./pository-install.sh [options] <package-name>
#
# Options:
#   -H, --host         <url>      Pository instance URL (required, or set POSITORY_URL)
#   -k, --api-key      <key>      API key with read permission (required, or set POSITORY_API_KEY)
#   -v, --version      <ver>      Package version (default: latest)
#   -r, --repo         <repo>     Repository name (default: default)
#   -d, --distribution <dist>     Distribution (default: stable)
#   -c, --component    <comp>     Component (default: main)
#   -a, --arch         <arch>     Architecture (default: system arch)
#       --dry-run                 Print the download URL without installing
#       --output       <file>     Save .deb to this path instead of a temp file
#   -h, --help                    Show this help
#
# Examples:
#   POSITORY_URL=https://pository.example.com POSITORY_API_KEY=xyz ./pository-install.sh pository
#   ./pository-install.sh -H http://localhost:3000 -k mykey -v 0.1.0 pository-frontend
#   ./pository-install.sh --host http://localhost:3000 --api-key mykey --dry-run pository

set -e

# ── defaults ────────────────────────────────────────────────────────────────
HOST="${POSITORY_URL:-}"
API_KEY="${POSITORY_API_KEY:-}"
VERSION=""
REPO="default"
DIST="stable"
COMP="main"
ARCH=""
DRY_RUN=false
OUTPUT_FILE=""
PACKAGE=""

# ── colour helpers ───────────────────────────────────────────────────────────
red()    { echo -e "\033[0;31m$*\033[0m"; }
green()  { echo -e "\033[0;32m$*\033[0m"; }
yellow() { echo -e "\033[0;33m$*\033[0m"; }
bold()   { echo -e "\033[1m$*\033[0m"; }

die()    { red "Error: $*" >&2; exit 1; }

usage() {
  grep '^#' "$0" | grep -v '#!/' | sed 's/^# \?//'
  exit 0
}

# ── argument parsing ─────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    -H|--host)         HOST="$2"; shift 2 ;;
    -k|--api-key)      API_KEY="$2"; shift 2 ;;
    -v|--version)      VERSION="$2"; shift 2 ;;
    -r|--repo)         REPO="$2"; shift 2 ;;
    -d|--distribution) DIST="$2"; shift 2 ;;
    -c|--component)    COMP="$2"; shift 2 ;;
    -a|--arch)         ARCH="$2"; shift 2 ;;
    --dry-run)         DRY_RUN=true; shift ;;
    --output)          OUTPUT_FILE="$2"; shift 2 ;;
    -h|--help)         usage ;;
    -*)                die "Unknown option: $1" ;;
    *)                 PACKAGE="$1"; shift ;;
  esac
done

# ── validation ───────────────────────────────────────────────────────────────
[[ -z "$PACKAGE" ]]  && die "Package name is required."
[[ -z "$HOST" ]]     && die "Pository host is required (--host or POSITORY_URL)."
[[ -z "$API_KEY" ]]  && die "API key is required (--api-key or POSITORY_API_KEY)."
HOST="${HOST%/}"  # strip trailing slash

# Detect system architecture if not specified
if [[ -z "$ARCH" ]]; then
  ARCH=$(dpkg --print-architecture 2>/dev/null || uname -m)
fi

# ── resolve version if not specified ─────────────────────────────────────────
if [[ -z "$VERSION" ]]; then
  bold "Querying latest version of ${PACKAGE}..."
  PACKAGES_JSON=$(curl -sf \
    -H "X-Api-Key: $API_KEY" \
    "${HOST}/api/v1/packages" 2>/dev/null) \
    || die "Failed to query packages list from ${HOST}."

  # Find matching packages (by name, repo, dist, comp; arch can be 'all' or specific)
  VERSION=$(echo "$PACKAGES_JSON" | python3 -c "
import json, sys
data = json.load(sys.stdin)
matches = [
    p for p in data.get('packages', [])
    if p['name'] == '$PACKAGE'
    and p['repo'] == '$REPO'
    and p['distribution'] == '$DIST'
    and p['component'] == '$COMP'
    and p['architecture'] in ('$ARCH', 'all')
]
if not matches:
    print('NOT_FOUND', end='')
    sys.exit(0)
# Sort by uploadedAt descending, pick latest
matches.sort(key=lambda p: p['uploadedAt'], reverse=True)
print(matches[0]['version'], end='')
" 2>/dev/null) || die "Failed to parse package list JSON."

  [[ "$VERSION" == "NOT_FOUND" ]] && \
    die "Package '${PACKAGE}' not found in ${REPO}/${DIST}/${COMP} for arch '${ARCH}'."

  bold "Latest version: ${VERSION}"
fi

# ── build download URL ────────────────────────────────────────────────────────
# Try arch-specific first; fall back to 'all'
DOWNLOAD_URL="${HOST}/repo/${DIST}/${COMP}/${ARCH}/${PACKAGE}_${VERSION}.deb"
ALL_URL="${HOST}/repo/${DIST}/${COMP}/all/${PACKAGE}_${VERSION}.deb"

if $DRY_RUN; then
  bold "Dry-run. Download URL:"
  echo "$DOWNLOAD_URL"
  echo "(fallback: $ALL_URL)"
  exit 0
fi

# ── download ──────────────────────────────────────────────────────────────────
if [[ -n "$OUTPUT_FILE" ]]; then
  TMPFILE="$OUTPUT_FILE"
else
  TMPFILE=$(mktemp /tmp/"${PACKAGE}_${VERSION}_XXXXXX.deb")
  trap 'rm -f "$TMPFILE"' EXIT
fi

bold "Downloading ${PACKAGE} ${VERSION}..."

# Try arch-specific, then all
if ! curl -sf -L -H "X-Api-Key: $API_KEY" -o "$TMPFILE" "$DOWNLOAD_URL"; then
  yellow "Not found at ${ARCH} URL, trying 'all' architecture..."
  curl -sf -L -H "X-Api-Key: $API_KEY" -o "$TMPFILE" "$ALL_URL" \
    || die "Failed to download package. Check the package name, version, and API key."
fi

PKG_SIZE=$(du -sh "$TMPFILE" | cut -f1)
green "Downloaded ${PACKAGE}_${VERSION}.deb (${PKG_SIZE})"

if [[ -n "$OUTPUT_FILE" ]]; then
  green "Saved to: ${OUTPUT_FILE}"
  exit 0
fi

# ── install ───────────────────────────────────────────────────────────────────
bold "Installing ${PACKAGE} ${VERSION}..."
DPKG_CMD="dpkg -i"
[[ "$EUID" -ne 0 ]] && DPKG_CMD="sudo dpkg -i"

# First pass: standard install
if $DPKG_CMD "$TMPFILE" 2>&1; then
  green "✓ ${PACKAGE} ${VERSION} installed successfully."
  exit 0
fi

# Capture unmet dependencies
UNMET=$(dpkg -I "$TMPFILE" | grep -E '^\s+Depends:' || true)
yellow "Unmet dependencies detected:"
echo "$UNMET"

# Try to satisfy dependencies via apt (only adds packages, never removes)
APT_CMD="apt-get install --fix-broken --no-remove -y"
[[ "$EUID" -ne 0 ]] && APT_CMD="sudo apt-get install --fix-broken --no-remove -y"

yellow "Attempting to resolve with apt-get (no-remove mode)..."
$APT_CMD 2>&1 || true

# Final pass with --force-depends if deps still unmet (e.g. nodejs via nvm)
if ! dpkg -l "$PACKAGE" 2>/dev/null | grep -q '^ii'; then
  yellow "Could not fully satisfy all declared dependencies."
  yellow "Proceeding with --force-depends. Ensure runtime prerequisites are met:"
  echo "$UNMET"
  $DPKG_CMD --force-depends "$TMPFILE" 2>&1 \
    || die "Installation failed. Please install required dependencies and retry."
fi

green "✓ ${PACKAGE} ${VERSION} installed successfully."

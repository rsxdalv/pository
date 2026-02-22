# Using Pository as an apt Repository

Pository exposes a standard apt-compatible repository interface so that clients
can add it as a package source and install packages with `apt install`.

No authentication is required to browse or download packages.  Upload and
management always require an API key.

---

## Table of Contents

1. [Repository URL structure](#repository-url-structure)
2. [Adding the repository to a Debian/Ubuntu host](#adding-the-repository)
3. [Installing packages](#installing-packages)
4. [Updating and removing the repository](#updating-and-removing)
5. [GPG signing (optional)](#gpg-signing)
6. [Configuration reference](#configuration-reference)
7. [Nginx / reverse-proxy notes](#nginx--reverse-proxy-notes)

---

## Repository URL Structure

Each Pository *repo* (e.g. `default`) is exposed at:

```
https://<host>/apt/<repo>/
```

The full apt path layout follows the standard Debian convention:

```
/apt/<repo>/dists/<distribution>/Release
/apt/<repo>/dists/<distribution>/<component>/binary-<arch>/Packages
/apt/<repo>/pool/<distribution>/<component>/<arch>/<name>_<version>_<arch>.deb
```

**Example** — for a default Pository install with one repo called `default` and
distribution `stable`:

```
https://pository.example.com/apt/default/dists/stable/Release
https://pository.example.com/apt/default/dists/stable/main/binary-amd64/Packages
https://pository.example.com/apt/default/pool/stable/main/all/hello_1.0_all.deb
```

---

## Adding the Repository

### Method 1 — sources.list.d (recommended)

```bash
echo "deb [trusted=yes] https://pository.example.com/apt/default stable main" \
  | sudo tee /etc/apt/sources.list.d/pository.list

sudo apt-get update
```

Replace:

| Placeholder | Meaning | Example |
|-------------|---------|---------|
| `pository.example.com` | Your Pository host | `pository.ttswebui.com` |
| `default` | Pository repo name | `default`, `releases`, `snapshots` |
| `stable` | Distribution name | `stable`, `unstable`, `jammy` |
| `main` | Component name | `main`, `contrib` |

### Method 2 — DEB822 format (Ubuntu 22.04+ / Debian 12+)

```
# /etc/apt/sources.list.d/pository.sources
Types: deb
URIs: https://pository.example.com/apt/default
Suites: stable
Components: main
Trusted: yes
```

```bash
sudo apt-get update
```

### Multiple repos or distributions

You can add more than one line to track different repos or distributions:

```
deb [trusted=yes] https://pository.example.com/apt/releases  stable main
deb [trusted=yes] https://pository.example.com/apt/snapshots unstable main
```

---

## Installing Packages

Once the repository is added and `apt-get update` has been run:

```bash
# Install a specific package
sudo apt-get install mypackage

# Install a specific version
sudo apt-get install mypackage=1.2.3

# Show available versions
apt-cache policy mypackage

# Show package details
apt-cache show mypackage

# Search for packages from this repo
apt-cache search <keyword>
```

---

## Updating and Removing

### Update the package index

```bash
sudo apt-get update
```

Pository's Release file includes a `Date:` field; apt caches it until the
next `update`.  CI jobs that upload new packages immediately should run
`apt-get update` before installing.

### Pin packages to this repository (optional)

Create `/etc/apt/preferences.d/pository`:

```
Package: *
Pin: origin pository.example.com
Pin-Priority: 900
```

### Remove the repository

```bash
sudo rm /etc/apt/sources.list.d/pository.list
sudo apt-get update
```

This does **not** remove already-installed packages.

---

## GPG Signing

The Release file served by Pository is currently *unsigned* (no `InRelease` or
`Release.gpg`).  The `[trusted=yes]` option in the sources line tells apt to
skip signature verification.

**For production deployments where you cannot use `trusted=yes`**, sign the
Release file externally and serve it alongside the unsigned one.  A common
approach is to generate a detached signature with a dedicated signing key and
mount the resulting `Release.gpg` file at the same path:

```
/apt/<repo>/dists/<distribution>/Release.gpg
```

Then distribute the public key to clients:

```bash
# On clients — import and trust the repo key
curl -fsSL https://pository.example.com/repo.gpg \
  | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/pository.gpg

# Drop trusted=yes once the key is installed
echo "deb https://pository.example.com/apt/default stable main" \
  | sudo tee /etc/apt/sources.list.d/pository.list
```

GPG signing pipelines are outside the scope of Pository itself but integrate
cleanly since the Release file is a plain text HTTP response.

---

## Configuration Reference

Apt repository paths are under `/apt/` and are always unauthenticated.  No
configuration is required beyond a standard Pository install.

Relevant config values in `/etc/pository/config.yaml`:

| Key | Effect on apt repo |
|-----|--------------------|
| `dataRoot` | Where `.deb` files are stored; pool paths are derived from this |
| `allowedRepos` | Repos listed here can receive uploads; apt serves whatever is stored |

---

## Nginx / Reverse-Proxy Notes

Ensure your reverse proxy forwards `/apt/` to the Pository backend.

**Nginx example** (add `apt` to the existing location block):

```nginx
location ~ ^/(api/v1|repo|apt|healthz|readyz|metrics) {
    proxy_pass http://127.0.0.1:3222;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Real-IP $remote_addr;
}
```

The Packages files and `.deb` downloads can be large; make sure
`proxy_read_timeout` and `client_max_body_size` are set appropriately if you
have large packages.

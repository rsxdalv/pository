# Pository

A lightweight, on-premises Debian package artifact repository service.

## Features

- **Debian Package Storage**: Upload, download, list, and delete `.deb` packages
- **API Key Authentication**: Role-based access control (admin, write, read)
- **REST API**: Simple JSON API for CI/CD integration
- **Filesystem Backend**: Configurable local storage with metadata tracking
- **Validation**: Debian package structure validation on upload
- **Observability**: Health endpoints, Prometheus metrics, structured JSON logging
- **Systemd Integration**: Runs as a managed service on Debian/Ubuntu systems

## Quick Start

### Development

```bash
# Install dependencies
npm install

# Set environment variables for development
export POSITORY_DATA_ROOT=/tmp/pository/data
export POSITORY_LOG_PATH=/tmp/pository/logs
export POSITORY_API_KEYS_PATH=/tmp/pository/api-keys.json
export POSITORY_ADMIN_KEY=your-secret-admin-key
export POSITORY_PORT=3000

# Start the server
npm start
```

### Production (Debian Package)

Building produces **two** Debian packages:
- `pository` — the backend API service (port 3000)
- `pository-frontend` — the optional web dashboard (port 3001); depends on `pository`

```bash
# Build both Debian packages
sudo apt-get install -y devscripts debhelper dh-exec
dpkg-buildpackage -us -uc -b

# Install the backend
sudo dpkg -i ../pository_*.deb

# Optionally install the web dashboard
sudo dpkg -i ../pository-frontend_*.deb

# Admin key is generated at install time
# Check /etc/pository/config.yaml
```

**Configuring CORS for the frontend:**  
If the frontend and backend run on the same host you can leave defaults.  
For remote or HTTPS deployments, set `corsOrigins` in `/etc/pository/config.yaml`  
or uncomment `POSITORY_CORS_ORIGINS` in `/etc/default/pository`.  

**Changing the backend URL the dashboard points to:**  
Edit `/etc/default/pository-frontend`, uncomment `NEXT_PUBLIC_API_URL`, then rebuild:
```bash
cd /usr/share/pository-frontend && sudo -u pository npm run build
sudo systemctl restart pository-frontend
```

## API Reference

### Authentication

All API endpoints (except health checks) require authentication via the `X-Api-Key` header:

```bash
curl -H "X-Api-Key: your-api-key" http://localhost:3000/api/v1/packages
```

### Endpoints

#### Health & Monitoring

| Method | Path | Description |
|--------|------|-------------|
| GET | `/healthz` | Liveness probe |
| GET | `/readyz` | Readiness probe |
| GET | `/metrics` | Prometheus metrics |

#### Packages

| Method | Path | Description | Required Role |
|--------|------|-------------|---------------|
| POST | `/api/v1/packages` | Upload package | write |
| GET | `/api/v1/packages` | List packages | read |
| GET | `/api/v1/packages/:repo/:dist/:comp/:arch/:name/:version` | Get metadata | read |
| GET | `/repo/:dist/:comp/:arch/:name_:version.deb` | Download package | read |
| DELETE | `/api/v1/packages/:repo/:dist/:comp/:arch/:name/:version` | Delete package | admin |

#### API Keys

| Method | Path | Description | Required Role |
|--------|------|-------------|---------------|
| POST | `/api/v1/keys` | Create API key | admin |
| GET | `/api/v1/keys` | List API keys | admin |
| DELETE | `/api/v1/keys/:id` | Delete API key | admin |

### Upload Package

```bash
curl -X POST http://localhost:3000/api/v1/packages \
  -H "X-Api-Key: your-write-key" \
  -F "repo=default" \
  -F "distribution=stable" \
  -F "component=main" \
  -F "file=@mypackage_1.0.0_amd64.deb"
```

**Note:** Package metadata (name, version, architecture) is extracted from the Debian control file for gzip-compressed packages. For packages using xz or zstd compression (common in modern Debian packages), metadata must be provided via the filename format `name_version_arch.deb`.

### Download Package

```bash
curl -H "X-Api-Key: your-read-key" \
  -O http://localhost:3000/repo/stable/main/amd64/mypackage_1.0.0.deb
```

### Create API Key

```bash
curl -X POST http://localhost:3000/api/v1/keys \
  -H "X-Api-Key: your-admin-key" \
  -H "Content-Type: application/json" \
  -d '{"role": "write", "description": "CI/CD upload key"}'
```

## Configuration

Configuration is loaded from `/etc/pository/config.yaml` or the path specified by `POSITORY_CONFIG` environment variable.

```yaml
# Data storage root directory
dataRoot: /var/lib/pository

# Log file directory
logPath: /var/log/pository

# Server settings
port: 3000
bindAddress: 0.0.0.0

# TLS configuration
tls:
  enabled: false
  cert: /etc/pository/server.crt
  key: /etc/pository/server.key

# Upload size limit (bytes)
maxUploadSize: 104857600  # 100MB

# Allowed repository names
allowedRepos:
  - default
  - releases
  - snapshots

# CORS origins allowed to access the API (comma separated)
# Leave empty to allow only localhost / 127.0.0.1 (safe for co-located installs)
# corsOrigins:
#   - https://pository.example.com

# Path to API keys storage
apiKeysPath: /etc/pository/api-keys.json

# Bootstrap admin key
adminKey: your-secret-admin-key
```

### Environment Variables

All configuration options can be overridden with environment variables:

| Variable | Description |
|----------|-------------|
| `POSITORY_CONFIG` | Path to config file |
| `POSITORY_DATA_ROOT` | Data storage directory |
| `POSITORY_LOG_PATH` | Log directory |
| `POSITORY_PORT` | Server port |
| `POSITORY_BIND_ADDRESS` | Bind address |
| `POSITORY_ADMIN_KEY` | Bootstrap admin API key |
| `POSITORY_API_KEYS_PATH` | API keys file path |
| `POSITORY_TLS_CERT` | TLS certificate path |
| `POSITORY_TLS_KEY` | TLS key path |
| `POSITORY_MAX_UPLOAD_SIZE` | Max upload size (bytes) |
| `POSITORY_CORS_ORIGINS` | Comma-separated CORS origins (e.g. `https://pository.example.com`) |

## Storage Layout

```
/var/lib/pository/
  {repo}/
    index.json
    {distribution}/
      {component}/
        {architecture}/
          {name}/{version}/
            package.deb
            metadata.json
```

## Using as an apt Repository

Pository exposes a standard apt repository interface under `/apt/<repo>/`. This lets you add it as a PPA and install packages with `apt install`.

For full details and advanced configuration see [APT.md](APT.md).

### Quick Setup

```bash
# 1. Add the repository (trusted — no GPG key required)
echo "deb [trusted=yes] https://pository.example.com/apt/default stable main" \
  | sudo tee /etc/apt/sources.list.d/pository.list

# 2. Update package lists
sudo apt-get update

# 3. Install a package from the repository
sudo apt-get install mypackage
```

### Available apt Endpoints (no authentication required)

| Path | Description |
|------|-------------|
| `/apt/:repo/dists/:distribution/Release` | Distribution Release file |
| `/apt/:repo/dists/:distribution/:component/binary-:arch/Packages` | Package index |
| `/apt/:repo/pool/:distribution/:component/:arch/:name_:version_:arch.deb` | Package download |

## GitHub Actions Integration

### Using the Pository Action

This repository provides a reusable GitHub Action for uploading Debian packages to a Pository instance.

```yaml
- name: Upload to Pository
  uses: rsxdalv/pository@main
  with:
    host: ${{ secrets.POSITORY_URL }}
    api-key: ${{ secrets.POSITORY_API_KEY }}
    file: dist/*.deb          # single file, glob pattern, or newline list
    repo: 'default'           # optional, defaults to 'default'
    distribution: 'stable'    # optional, defaults to 'stable'
    component: 'main'         # optional, defaults to 'main'
```

**Inputs:**
- `host` (required): URL of your Pository instance (e.g., `https://pository.example.com`)
- `api-key` (required): API key with write permission
- `file` (required): Path(s) to the Debian package file(s) to upload. Accepts a single path, a glob pattern (e.g. `dist/*.deb`), or a newline-separated list. **All** matching files are uploaded.
- `repo` (optional): Repository name, defaults to `default`
- `distribution` (optional): Distribution name, defaults to `stable`
- `component` (optional): Component name, defaults to `main`

**Outputs:**
- `package-name`: Name of the last uploaded package
- `package-version`: Version of the last uploaded package
- `package-architecture`: Architecture of the last uploaded package
- `packages-uploaded`: Total number of packages successfully uploaded

**Security Note:** Always store your Pository URL and API key as GitHub secrets.

### Example Workflow

See `.github/workflows/publish-example.yaml` for a complete example workflow that builds and publishes a Debian package to a pository instance.

Required secrets:
- `POSITORY_URL`: URL of your pository instance
- `POSITORY_API_KEY`: API key with write permission

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run linter
npm run lint

# Start in development mode (with auto-reload)
npm run dev
```

## Testing

```bash
# Run all tests
npm test

# Run specific test file
node --import=tsx --test tests/storage.test.ts
```

## Security Considerations

- Always use HTTPS in production (configure TLS or use a reverse proxy)
- Store the admin key securely and rotate regularly
- Create scoped API keys with minimal required permissions
- Use firewall rules to restrict access
- Regularly review access logs
- Built-in rate limiting (100 requests/minute per API key or IP)

## License

MIT

**App structure**

- **Root**: project manifest and packaging metadata. See `AGENTS.md` for a short developer-facing map.
- **Backend (`src/`)**: Fastify-based server. Entry point: `src/index.ts`. Route handlers live in `src/routes/`, core services in `src/services/`, and runtime configuration in `src/config.ts`.
- **Frontend (`frontend/`)**: Next.js dashboard (App Router) that runs on port `3001` in development. The frontend uses the `NEXT_PUBLIC_API_URL` env var to locate the backend and stores API keys locally in the browser.
- **Debian packaging (`debian/`)**: Control files, `postinst` and systemd integration used to build production `.deb` packages via `dpkg-buildpackage`.
- **MCP workflow tools (`mcp-action-workflow/`)**: Helpers for generating GitHub Actions workflows and MCP tooling for the bundled `action.yml`.
- **Tests (`tests/`)**: Unit and integration tests executed by `npm test`.

If you are an automation agent or maintainer: see `AGENTS.md` for a compact actionable layout and quick run commands.

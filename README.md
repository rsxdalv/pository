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

```bash
# Build the Debian package
sudo apt-get install -y devscripts debhelper dh-exec
dpkg-buildpackage -us -uc -b

# Install
sudo dpkg -i ../pository_*.deb

# The service will auto-start and an admin key will be generated
# Check the admin key in /etc/pository/config.yaml
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

## GitHub Actions Integration

See `.github/workflows/publish-example.yaml` for an example workflow that builds and publishes a Debian package to a pository instance.

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

## License

MIT

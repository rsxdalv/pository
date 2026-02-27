App structure summary for agents and automation

This file gives a concise overview of the Pository repository layout and responsibilities so automation agents and maintainers can find relevant code quickly.

- Root
  - `package.json` - project manifest for the monorepo-style repository (backend + frontend deps)
  - `README.md`, `ACTION.md` - docs and GitHub Action examples (action.yml lives in `rsxdalv/pository-deploy-action`)
  - `debian/` - Debian packaging metadata and systemd unit templates
  - `pository.service` / `pository-frontend.service` - systemd units for backend and frontend
  - `postinst` / `pository-frontend.postinst` - install-time setup for each package
  - `rules` - builds/installs both the backend (`pository`) and frontend (`pository-frontend`) packages
  - `mcp-action-workflow/` - helper MCP server and tools for generating GitHub workflows

- `src/` (backend)
  - `index.ts` - application entry point (Fastify server setup, middleware, route registration)
  - `routes/` - HTTP route handlers: `packages.ts`, `keys.ts`, `health.ts`
  - `services/` - core services: `storage.ts`, `api-keys.ts`, `debian-validator.ts`, `oidc-scope.ts`
  - `middleware/` - auth middleware: `auth.ts` (dual API-key/OIDC), `oidc-auth.ts` (JWT verification)
  - `utils/` - config loader and logging helpers
  - `config.ts` - runtime configuration types (includes OIDC fields)

- `frontend/` (dashboard)
  - Next.js App Router application (port 3001 by default)
  - `app/`, `components/`, `lib/` contain UI pages, components and the API client
  - `lib/api.ts` - frontend client that talks to the backend API (uses `X-Api-Key` header)

- `tests/`
  - Unit and integration tests run via `npm test` (Node's `--test` harness with `tsx` import)

- Typical developer workflows
  - Local development: run backend with `POSITORY_DATA_ROOT=/tmp/pository/data POSITORY_API_KEYS_PATH=/tmp/pository/api-keys.json POSITORY_ADMIN_KEY=... npm run dev` and frontend with `cd frontend && npm run dev`
  - Build Debian package: `sudo apt-get install devscripts debhelper dh-exec && dpkg-buildpackage -us -uc -b` — produces two packages: `pository` (API) and `pository-frontend` (dashboard)
  - Upload packages: use the REST API (`/api/v1/packages`) or the included GitHub Action

Notes
- Configuration is loaded from `/etc/pository/config.yaml` or via environment variables (see `README.md` for keys).
- Backend default port: 3000. Frontend default port: 3001.
- CORS: set `corsOrigins` in config.yaml (or `POSITORY_CORS_ORIGINS` env var, comma-separated) to the URL(s) where the frontend is served.
- `NEXT_PUBLIC_API_URL` is baked into the Next.js build at `postinst` time. Change `/etc/default/pository-frontend`, then re-run `cd /usr/share/pository-frontend && npm run build` and restart the service.
- Authentication: two mechanisms are supported on all upload endpoints:
  1. API key via `X-Api-Key` header (existing, managed via `/api/v1/keys`)
  2. GitHub OIDC JWT via `Authorization: Bearer <token>` — no static secret needed.
     Default authz rule: private repos under `oidcAllowedOwners` (default `rsxdalv`) may upload
     a package whose name matches the GitHub repo name (convention over config).
     Override map (`oidcOverrides` in config.yaml) covers multi-package repos and wildcards.
     The GitHub Action (`rsxdalv/pository-deploy-action`) supports `use-oidc: true` to use this path.

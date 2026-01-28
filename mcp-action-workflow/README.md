# pository-action-mcp

Minimal MCP server (Node.js + TypeScript) using the official SDK and stdio transport.

## Setup

- Install deps: `npm install`
- Run dev server: `npm run dev`
- Build: `npm run build`
- Start: `npm run start`

## Tools

- `generate_github_workflow`: emits a ready-to-commit GitHub Actions workflow that uses the local `action.yml` to push a Debian package to Pository. Defaults: workflow file `.github/workflows/push-to-pository.yml`, action path `./`, package path `dist/*.deb`, repo `default`, distribution `stable`, component `main`, secrets `POSITORY_HOST` and `POSITORY_API_KEY`.
- `gh_secret_commands`: prints the `gh secret set` commands for the required Pository secrets (repo-level by default; pass `env` or `org` to target environment or organization scopes).

## Quick prompt

Use this when chatting with the MCP-enabled client:

"Generate a GitHub Actions workflow in `.github/workflows/push-to-pository.yml` that uses the local `action.yml` to upload a Debian package to Pository. Use secrets POSITORY_HOST and POSITORY_API_KEY, defaults repo=default, distribution=stable, component=main, and allow a workflow_dispatch input for the package path. Then give me the gh CLI commands to set those secrets at the repo scope."

## Notes

- Run `generate_github_workflow` to drop the YAML directly into the workflow file path you prefer.
- Run `gh_secret_commands` with `env` or `org` if you want environment or organization scoped secrets (e.g., `env=production`).

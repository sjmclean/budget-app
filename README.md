# Budget App

Budget App is a local-first budgeting application with transaction registers,
category budgeting, imports, reporting, scheduled transactions, attachments,
and recovery tools.

## Current architecture

The React/Vite client commits interactive budget changes to browser-side SQLite
through a dedicated worker. Those local commits do not wait for the server. The
server provides authentication, budget coordination, and a synchronization relay
for per-budget epochs, complete baselines, and ordered mutations; it is not the
live budgeting database. Shared application and domain rules live in the packages
workspace.

See [the documentation index](docs/README.md), [application architecture](docs/application-architecture.md),
and [persistence and synchronization](docs/persistence-and-sync.md) for the
canonical runtime description.

## Repository layout

- `apps/web` — React/Vite client and worker-backed local SQLite runtime.
- `apps/server` — authenticated HTTP API and synchronization relay.
- `packages/*` — shared application, domain, persistence, and type packages.
- `tests` — unit, integration, and regression coverage.
- `docs` — canonical documentation, subsystem references, ADRs, and history.
- `scripts` — development, validation, and generated-audit tooling.
- `tools` — benchmarks and performance diagnostics.

## Requirements

Use Node.js 22.12.0 or newer. CI runs on Node.js 22. The package manager is pnpm
10.28.2, as declared by the root `packageManager` field; Corepack can activate
that pinned version.

The root `package.json` version is the single Budget App product-version source.
Private implementation workspaces do not carry independent release versions.

## Install

```bash
corepack enable
pnpm install
```

## Development

```bash
pnpm dev
```

This starts the server on port 3000 and the Vite development server on port 5173.
Vite proxies `/api` to `http://127.0.0.1:3000`. Run either service independently
with `pnpm dev:server` or `pnpm dev:web`.

The web client supports `VITE_BUDGET_API_URL` when the API is not available on
the same origin. Development HTTPS can be enabled by providing both
`BUDGET_APP_HTTPS_CERT` and `BUDGET_APP_HTTPS_KEY`; otherwise Vite uses
`.certs/budget-app-dev.crt` and `.certs/budget-app-dev.key` when both exist.

## Build and validation

- `pnpm verify` — the canonical local and CI gate: lint/static checks, web TypeScript,
  required tests, production build, documentation/audit freshness, and build budgets.
- `pnpm test:quality-gates` — compatibility alias for `pnpm verify`.
- `pnpm lint` — conservative ESLint correctness checks, including React hook call order.
- `pnpm static:check` — lint plus syntax validation for server and script JavaScript.
- `pnpm typecheck` — strict TypeScript validation for the web application and the
  shared package modules reachable from it.
- `pnpm test:required` — all discovered unit, integration, and regression tests.
- `pnpm test:web-build` — TypeScript-check and build the web application.
- `pnpm docs:architecture:check` — validate documentation structure and persistence-audit freshness.
- `pnpm audit:persistence` — regenerate the persistence inventory after relevant source changes.
- `pnpm audit:persistence:check` — verify the generated inventory is current.
- `pnpm build:performance` — build the web client and analyze its output budgets.

## Documentation

Start with [docs/README.md](docs/README.md). It distinguishes canonical current
documentation from detailed subsystem references, generated reports, ADRs, and
historical migration material.

## Persistence and data safety

SQLite is the local interactive authority, while synchronization exchanges that
state with other devices. Synchronization is not a substitute for backups. See
[operations and recovery](docs/operations-and-recovery.md) for SQLite backups,
authoritative restore, restore points, and interrupted-recovery behavior.

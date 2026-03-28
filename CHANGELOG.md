# Changelog

All notable changes to Corn Hub will be documented in this file.

## [0.1.1] — 2026-03-28

### 🐛 Bug Fixes

- **Docker build: missing `shared-mem9` in MCP Dockerfile** — `corn-mcp` depends on `@corn/shared-mem9` but the Dockerfile never copied it; added to all stages (deps, prod-deps, runner, symlinks, metadata)
- **Docker build: broken `.bin` symlinks with pnpm hoisting** — `pnpm install` with `node-linker=hoisted` creates broken per-package `node_modules/.bin/tsc` symlinks inside Docker; fixed by removing broken `.bin` dirs before build and using `npx tsc` to resolve from root
- **Docker build: workspace glob mismatch** — `pnpm-workspace.yaml` uses `apps/*`/`packages/*` globs but Dockerfiles only include a subset of packages; now generates a scoped workspace yaml per Dockerfile to prevent resolution errors
- **Docker build: invalid COPY with shell redirect** — `COPY ... 2>/dev/null || true` is invalid Dockerfile syntax; replaced with `RUN cp` in builder stage
- **Production module resolution** — `shared-types` and `shared-utils` had `"main": "./src/index.ts"` pointing to TypeScript source; changed to `"./dist/index.js"` so compiled output is resolved in production containers
- **Embedding fallback** — MCP server now uses local hash-based embedding when external API key is invalid, ensuring memory/knowledge tools remain functional

### 🔧 Infrastructure

- All package build scripts changed from `tsc` to `npx tsc` for Docker compatibility
- All three Dockerfiles (`corn-api`, `corn-mcp`, `corn-web`) updated with scoped workspace approach and `.bin` cleanup
- Full Docker Compose stack verified: Qdrant, corn-api, corn-mcp, corn-web, Watchtower all healthy

## [0.1.0] — 2026-03-28

### 🐛 Bug Fixes

- **SQL injection** in `usage.ts` and `analytics.ts` — user-supplied `days` param was string-interpolated into SQL; now uses parameterized queries (`3852d78`)
- **Route conflict** — both `metricsRouter` and `analyticsRouter` were mounted on `/api/metrics`; analytics moved to `/api/analytics` (`3852d78`)
- **ESM `require()` calls** — replaced CommonJS `require('child_process')` in `system.ts` and `require('node:crypto')` in `shared-utils` with proper ESM imports (`3852d78`)
- **TypeScript parameter properties** — refactored `CornError` and other classes to avoid Node.js strip-only TS mode errors (`1b271e1`, `12c2ee5`)

### 📝 Documentation

- Added MCP path setup guide and troubleshooting section (`30dac4c`)
- Added deep mathematical token economy analysis (`d0b501f`)

### 🎉 Initial Release

- **corn-api** — Hono-based REST API with SQLite (sql.js), serving dashboard data, sessions, quality reports, knowledge, projects, providers, usage, analytics, webhooks, code intel, and system metrics
- **corn-mcp** — MCP server with 17 tools: memory, knowledge, quality, sessions, code intelligence, analytics, and change awareness — supports both Streamable HTTP and STDIO transports
- **corn-web** — Next.js 16 dashboard with real-time health monitoring, activity feed, quality gauges, and quick-connect setup
- **shared-mem9** — Qdrant vector DB client with OpenAI embedding provider for semantic memory and knowledge search
- **shared-types** — Shared TypeScript interfaces for all services
- **shared-utils** — Logger, error classes, ID generation, and utility functions
- Docker Compose infrastructure with Qdrant, nginx, and multi-stage builds (`0bff0fc`)

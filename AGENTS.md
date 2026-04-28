# flow-punk — Agent Documentation Index

AI-powered CRM platform built on Cloudflare Workers. In this checkout, the indie workspace contains the gateway service and the shared `service-utils` package.

## Documentation Map

### Architecture

| Document | Path | Covers |
|----------|------|--------|
| Managed Codebase Summary | `../managed/docs/arch-summary.md` | Directory-level overview of the current parent checkout |

### Service Documentation

| Service | Service Path | API Docs |
|---------|-------------|----------|
| Gateway | `services/gateway/` | `../managed/docs/services/gateway.md` |
| Contacts | `services/contacts/` | `../managed/docs/services/contacts.md` |

### Packages

| Package | Path | Purpose |
|---------|------|---------|
| service-utils | `packages/service-utils/` | Logger, auth, errors, tracing, idempotency, audit emission |
| db | `packages/db/` | Indie platform DB schema (`users`, `mcp_sessions`) and repositories |

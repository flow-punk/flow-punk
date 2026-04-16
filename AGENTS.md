# flow-punk — Agent Documentation Index

AI-powered CRM platform built on Cloudflare Workers. pnpm monorepo with shared packages, 10+ services, and an Astro dashboard. Multi-tenant, event-driven, MCP-integrated.

## Documentation Map

### Architecture

| Document | Path | Covers |
|----------|------|--------|
| Codebase Summary | `docs/arch-summary.md` | Directory-level overview of every package, service, and app |

### Service Documentation

| Service | Service Path | API Docs |
|---------|-------------|----------|
| Auth | `services/auth/` | `docs/services/auth.md` |
| Automations | `services/automations/` | `docs/services/automations.md` |
| CMS | `services/cms/` | `docs/services/cms.md` |
| Contacts (People) | `services/contacts/src/people/` | `docs/services/people.md` |
| Contacts (Accounts) | `services/contacts/src/accounts/` | `docs/services/accounts.md` |
| Events | `services/events/` | `docs/services/events.md` |
| Form Inputs | `services/forminputs/` | `docs/services/forminputs.md` |
| Gateway | `services/gateway/` | `docs/services/gateway.md` |
| OAuth | `services/oauth/` | `docs/services/oauth.md` |
| Pipeline | `services/pipeline/` | `docs/services/pipeline.md` |
| Shopify | `services/shopify/` | `docs/services/shopify.md` |

### Packages

| Package | Path | Purpose |
|---------|------|---------|
| contracts | `packages/contracts/` | Shared TypeScript types, event schemas, error codes |
| db | `packages/db/` | Drizzle ORM schema, database client, migrations |
| service-utils | `packages/service-utils/` | Logger, auth, errors, tracing, idempotency |
| tool-registry | `packages/tool-registry/` | MCP tool definitions and registry |
| dev-stubs | `packages/dev-stubs/` | Test data factories and stub generation |

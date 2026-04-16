# Creel — Codebase Architecture Summary

AI-powered CRM platform built on Cloudflare Workers as a pnpm monorepo.

---

## `/apps`

### `/apps/dashboard`

Admin dashboard and CRM UI built with Astro 5, React 19, and TailwindCSS 4. Deployed to Cloudflare Pages.

- `/src/pages` — Astro page routes (home, pipeline, contacts, automations)
- `/src/components` — React island components (PipelineBoard, AutomationBuilder, QueryProvider)
- `/src/layouts` — Shared page layouts
- `/src/lib` — API client for backend communication
- `/src/styles` — Global CSS styles

---

## `/packages`

Shared libraries consumed by services and apps.

### `/packages/contracts`

Shared TypeScript types, event schemas, error codes, and automation DAG definitions.

- `/src/events` — Event type definitions per domain (people, accounts, pipeline, auth, payments, etc.)
- `/src/services` — Service-specific request/response interfaces
- `/src/errors` — Structured error codes and types
- `/src/automation` — Workflow DAG types, node/edge definitions, action/trigger/condition registries

### `/packages/db`

Drizzle ORM schema definitions, database client factory, and migrations.

- `/src/schema` — Table definitions (tenants, auth, people, accounts, deals, automations, emails, invoices, payments, events_log, search_sync, forminputs, cms, oauth)
- `/src/client.ts` — Database client factory with Hyperdrive connection pooling
- `/drizzle` — Migration files

### `/packages/service-utils`

Shared runtime utilities used by all services.

- `/src/logger.ts` — Structured JSON logger with automatic PII redaction
- `/src/auth.ts` — JWT verification and authentication helpers
- `/src/idempotency.ts` — Idempotency key handling for write operations
- `/src/tracing.ts` — Request ID correlation and distributed tracing
- `/src/errors.ts` — Structured error definitions and response formatting
- `/src/metrics.ts` — Observability and metrics collection
- `/src/worker.ts` — Minimal Worker shell for tenant enforcement, MCP plumbing, and shared 404/500 handling

### `/packages/tool-registry`

Canonical MCP tool catalog and tool-search metadata used by gateway and services.

- `/src/catalog.ts` — Shared static tool definitions plus availability metadata
- `/src/types.ts` — Shared MCP tool and discovery types

### `/packages/dev-stubs`

Development stubs and mock data generation for testing.

- `/src/stub-factory.ts` — Factory functions for creating test data
- `/src/generate.ts` — CLI for generating stub data
- `/stubs` — Pre-generated stub data files

---

## `/services`

Cloudflare Workers implementing the backend.

### `/services/gateway`

API gateway and single entry point for all requests. Handles routing, auth, CORS, rate limiting, and the MCP server endpoint.

- `/src/middleware` — Middleware chain (auth, cors, rate-limit, logging, request-id)
- `/src/mcp` — MCP protocol implementation
- `/src/rest` — REST API request delegation to domain services
- `/src/router.ts` — URL-based request router

### `/services/auth`

Identity, access management, and tenant administration.

- `/src/auth` — Authentication handlers (login, signup, forgot-password, reset-password, verify)
- `/src/tenants` — Tenant/organization management
- `/src/users` — User CRUD within tenants
- `/src/roles` — Authorization role definitions (owner, admin, member, readonly)
- `/src/permissions` — Fine-grained permission management
- `/src/api-keys` — Service-to-service API key management

### `/services/contacts`

People and accounts management.

- `/src/index.ts` — Single Worker entry point for both subdomains and MCP endpoints
- `/src/people` — Contact/individual CRUD and search
- `/src/accounts` — Company/organization CRUD and search
- `/src/events.ts` — Event publishing to queue

### `/services/pipeline`

Sales pipeline, stages, and deal tracking.

- `/src/handlers` — Handlers for pipelines, stages, and deals (including move, win/loss)
- `/src/service.ts` — Pipeline business logic
- `/src/events.ts` — Event publishing to queue

### `/services/automations`

DAG-based workflow automation engine using Durable Objects.

- `/src/durable-objects` — Workflow execution Durable Object (persistent state, alarms, resumable)
- `/src/engine` — Execution components (DAG executor, condition evaluator, action dispatcher)
- `/src/handlers` — API handlers (create, trigger, list, get-status)
- `/src/events.ts` — Event publishing to queue

### `/services/cms`

Content management system for custom collections and entries.

- `/src/handlers` — CRUD handlers for collections and entries
- `/src/service.ts` — CMS business logic
- `/src/events.ts` — Event publishing to queue

### `/services/events`

Event ingestion, routing, and audit logging.

- `/src/handlers` — Event ingestion and query handlers
- `/src/service.ts` — Event processing and routing logic

### `/services/forminputs`

Form builder and submission handling.

- `/src/handlers` — CRUD handlers for forms, fields, and submissions
- `/src/service.ts` — Form processing and validation logic
- `/src/events.ts` — Event publishing to queue

### `/services/oauth`

OAuth connection management for third-party integrations.

- `/src/handlers` — OAuth flow handlers (authorize, callback, revoke)
- `/src/service.ts` — Token management and refresh logic

### `/services/shopify`

Shopify integration for e-commerce data sync.

- `/src/handlers` — Webhook handlers and sync operations
- `/src/service.ts` — Shopify API client and data mapping

---

## `/docs`

### `/docs/architecture`

Architecture Decision Records (ADR-001 through ADR-008) covering database choice, service communication, multi-tenancy, automation engine, search, MCP design, privacy/logging, and dynamic MCP introspection.

### `/docs/services`

Primary docs for deployable workers, plus subordinate reference pages for internal subdomains such as people/accounts within Contacts.

### `/docs/llm-context`

AI assistant context files: system overview, coding conventions, and per-service or per-subdomain context summaries.

# flow-punk

> Open-source, agent-native headless CRM. Self-host on your own Cloudflare account in one command.

flow-punk is a CRM built for AI agents first and humans second. Every entity — contacts, pipelines, deals, users — is reachable over both a typed REST API and the [Model Context Protocol](https://modelcontextprotocol.io). It runs entirely on Cloudflare Workers, D1, and KV, so you own the deployment and the data.

- **License:** AGPL-3.0-only
- **Runtime:** Cloudflare Workers (free tier is enough to start)
- **Node:** ≥ 20 (for the CLI)

---

## Why flow-punk

Most CRMs were built for people clicking through screens. flow-punk is built for agents that read, reason, and act on your customer data through tools. The same gateway that serves your dashboard exposes an MCP server, so any MCP-compatible client (Claude Desktop, an in-house agent, your own UI) gets first-class access — not a bolt-on integration.

It's headless and single-tenant: one deployment is one workspace, sitting on infrastructure you control.

---

## Features

**Core CRM**

- Contacts: accounts and persons
- Pipelines, stages, and deals
- Users with role-based access (owner / admin / member)

**Agent-native**

- Built-in MCP server with a dynamic tool catalog
- Streaming MCP sessions backed by a Durable Object
- Every REST route has a matching MCP tool

**API surface**

- Typed REST API under `/api/v1/*`
- OpenAPI 3.1 spec served at `/api/docs` (local dev)
- Idempotency-Key support on writes

**Auth and audit**

- API keys (`fpk_*`) with scopes and last-used tracking
- Admin sessions over secure cookies
- Structured logs and audit events on every mutation

---

## Quick start

You need a Cloudflare account and Node 20+. The CLI handles the rest.

```bash
# 1. Authorize the CLI against your Cloudflare account (browser-based OAuth via wrangler)
npx flowpunk login

# 2. Provision a fresh deployment (interactive)
npx flowpunk init

# 3. Sanity-check it
npx flowpunk doctor
```

`init` provisions everything end-to-end on your Cloudflare account:

| Resource | Count | Purpose |
| --- | --- | --- |
| Workers | 5 | 1 public gateway + 4 internal services (auth, users, contacts, pipeline) |
| D1 database | 1 | All CRM data (shared across services) |
| KV namespaces | 6 | MCP tool catalog, MCP sessions, idempotency keys, last-used tracking |
| Durable Object | 1 | MCP streaming sessions |

When `init` finishes it prints:

- Your gateway URL — e.g. `https://flowpunk-gateway.<your-subdomain>.workers.dev`
- A first-admin API key (`fpk_…`) — save it, it is shown once
- An admin session cookie for the dashboard / API

### Connect an MCP client

Paste this into your MCP client's config (Claude Desktop example shown):

```json
{
  "mcpServers": {
    "flow-punk": {
      "url": "https://flowpunk-gateway.<your-subdomain>.workers.dev/mcp",
      "headers": {
        "Authorization": "Bearer fpk_your_key_here"
      }
    }
  }
}
```

Restart the client and your agent will see the full tool catalog.

### Try the API

```bash
export COOKIE="<session cookie from init>"

curl -i \
  -H "Cookie: fp_session=$COOKIE" \
  -H "Content-Type: application/json" \
  -d '{"label":"manual-test","scopes":["read","write"]}' \
  -X POST https://flowpunk-gateway.<your-subdomain>.workers.dev/api/v1/auth/keys
```

### CLI commands

| Command | What it does |
| --- | --- |
| `flowpunk login` | Browser-based Cloudflare OAuth (via wrangler) |
| `flowpunk logout` | Clear stored credentials |
| `flowpunk init` | Interactive first-time provision |
| `flowpunk doctor` | Health-check the deployment |
| `flowpunk status` | Show deployed resources and versions |
| `flowpunk teardown` | Delete deployed Workers + KVs (D1 retained for safety) |

The CLI never copies or persists your Cloudflare token to its own config — it reads wrangler's OAuth token on demand. For CI or sandboxed environments, pass `--token <CF_API_TOKEN>` to any command.

---

## Architecture at a glance

```
                         ┌─────────────────────────┐
  MCP / REST client ───▶ │   gateway  (public)     │
                         │   • auth middleware     │
                         │   • MCP server          │
                         │   • OpenAPI / docs      │
                         └────────────┬────────────┘
                                      │ service bindings
              ┌──────────┬────────────┼────────────┬──────────┐
              ▼          ▼            ▼            ▼          │
          ┌──────┐  ┌────────┐  ┌──────────┐  ┌──────────┐   │
          │ auth │  │ users  │  │ contacts │  │ pipeline │   │
          └──┬───┘  └───┬────┘  └────┬─────┘  └────┬─────┘   │
             └──────────┴────────────┴─────────────┘         │
                                │                            │
                                ▼                            ▼
                          ┌──────────┐                ┌────────────────┐
                          │  D1 (DB) │                │  KV  +  DO     │
                          └──────────┘                └────────────────┘
```

- The **gateway** is the only Worker with a public route. It runs the auth middleware, mounts the MCP server, and fans out to internal services over Cloudflare service bindings (no public network hops).
- **auth, users, contacts, pipeline** are internal-only Workers. They share the D1 database and use a per-service idempotency KV.
- **D1** holds CRM data. **KVs** back the MCP tool catalog, MCP sessions, idempotency, and last-used tracking. The **Durable Object** drives streaming MCP sessions.

---

## Run from source

The published CLI is the recommended path. If you want to hack on flow-punk itself, clone the repo and run it locally.

```bash
git clone https://github.com/flow-punk/flow-punk.git
cd flow-punk
pnpm install
```

Run all services with one command (turbo orchestrates `wrangler dev` per service):

```bash
pnpm dev
```

Other useful scripts:

```bash
pnpm db:migrate    # apply Drizzle migrations to local D1
pnpm test          # run unit + integration tests
pnpm typecheck     # type-check the workspace
pnpm lint          # lint the workspace
pnpm build         # build all packages and services
```

Local-dev environment variables go in `.env` at the repo root. Each service runs on a fixed local port so cross-service bindings stay stable.

---

## Repository layout

```
indie/
├── services/
│   ├── gateway/      # public Worker (REST + MCP + auth middleware)
│   ├── auth/         # API keys, sessions, /auth/validate
│   ├── users/        # user CRUD + roles
│   ├── contacts/     # accounts + persons
│   └── pipeline/     # pipelines, stages, deals
└── packages/
    ├── cli/                  # `flowpunk` CLI (published to npm)
    ├── cf-admin/             # Cloudflare control-plane HTTP client
    ├── db/                   # Drizzle schema + repos for D1
    ├── service-utils/        # logger, auth, errors, tracing, idempotency
    ├── tool-registry/        # MCP tool catalog
    ├── openapi-from-drizzle/ # Drizzle → OpenAPI 3.1 converter
    ├── auth-core/            # edition-agnostic auth router/handlers
    ├── users-core/           # edition-agnostic users router/handlers
    ├── contacts-core/        # edition-agnostic contacts router/handlers
    ├── pipeline-core/        # edition-agnostic pipeline router/handlers
    └── *-spec/               # per-service OpenAPI 3.1 fragments
```

---

## License

flow-punk is licensed under **AGPL-3.0-only**. You can self-host it freely, modify it, and use it inside your organization. If you offer a modified version as a network service to others, the AGPL requires you to share your source changes under the same license.

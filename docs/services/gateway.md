# Gateway Service

## Overview

The Gateway service is the main entry point for all API requests to the Creel CRM platform. It handles authentication, authorization, rate limiting, and request routing to backend services.

## API Endpoints

| Method | Path      | Description                            |
| ------ | --------- | -------------------------------------- |
| `POST` | `/mcp`    | MCP JSON-RPC endpoint (OAuth 2.1 PKCE) |
| `*`    | `/api/*`  | Routes to appropriate backend service  |
| `GET`  | `/health` | Health check endpoint                  |

## Authentication

The gateway supports two authentication methods:

- **API keys** — `Authorization: Bearer creel_...` for REST API access. The gateway validates the key against the auth service and resolves the tenant/user context.
- **OAuth 2.1 PKCE** — For MCP clients (e.g., Claude Code). The gateway exposes `.well-known` discovery endpoints, dynamic client registration, and a full PKCE authorization flow. Tokens are prefixed `mcp_` and hashed at rest.

## MCP Tool Caching

The gateway maintains a per-tenant cache of MCP tool definitions in the `MCP_TOOLS_KV` Cloudflare KV namespace.

**Cache key:** `mcp:tools:{tenantId}`
**TTL:** 5 minutes

On a `tools/list` request, the gateway checks KV first. On a cache miss it fans out in parallel to all service bindings (`CONTACTS_SERVICE`, `PIPELINE_SERVICE`, `AUTOMATIONS_SERVICE`, `FORMINPUTS_SERVICE`, `CMS_SERVICE`, `SHOPIFY_SERVICE`) via their `GET /mcp/tools` endpoints, merges the results, and stores them in KV before returning.

**Cache invalidation:** After any successful `collections_create`, `collections_update`, or `collections_delete` tool call, the gateway deletes the tenant's cache key so the next `tools/list` reflects the updated collection set. REST API-driven collection changes are covered by the 5-minute TTL.

See [ADR-008](../architecture/ADR-008-dynamic-mcp-introspection.md) for the full architecture rationale.

## Current Runtime Notes

- Tenant-facing tool discovery uses per-service `/mcp/tools` endpoints; the gateway is not the primary source of truth for live tool lists.
- Static tool schemas and discovery metadata live in `@creel/tool-registry`.
- `tools_search` compares that shared catalog against the tenant's current `tools/list` results and returns human-readable availability guidance.

## Configuration

Environment variables:

- `AUTH_SECRET` - JWT signing secret
- `RATE_LIMIT_RPS` - Requests per second limit

## Development

```bash
pnpm dev --filter=@creel/gateway
```

The gateway runs on port 8787 by default in development mode.

## Local MCP Development

Claude Code connects directly to the gateway's `/mcp` endpoint using the streamable HTTP transport. Add this to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "creel-crm": {
      "type": "url",
      "url": "http://localhost:8787/mcp"
    }
  }
}
```

Claude Code will automatically discover the OAuth endpoints via `/.well-known/oauth-protected-resource` and run the PKCE authorization flow to obtain an access token.

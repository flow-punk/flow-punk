# CMS Service

## Overview

The CMS service provides content management for custom collections and entries. Collections define content type schemas (with configurable field definitions), and entries are content records validated against those schemas. Supports linking to people and accounts.

## API Endpoints

| Method   | Path               | Description                              |
| -------- | ------------------ | ---------------------------------------- |
| `GET`    | `/collections`     | Search/list collections                  |
| `POST`   | `/collections`     | Create collection                        |
| `GET`    | `/collections/:id` | Get collection by ID                     |
| `PATCH`  | `/collections/:id` | Update collection                        |
| `DELETE` | `/collections/:id` | Delete collection                        |
| `GET`    | `/entries`         | Search/list entries                      |
| `POST`   | `/entries`         | Create entry                             |
| `GET`    | `/entries/:id`     | Get entry by ID                          |
| `PATCH`  | `/entries/:id`     | Update entry                             |
| `DELETE` | `/entries/:id`     | Delete entry                             |
| `GET`    | `/mcp/tools`       | Returns MCP tool definitions for gateway |
| `POST`   | `/mcp/execute`     | Executes an MCP tool call                |

## MCP Tool Generation

The `/mcp/tools` endpoint returns both catalog-backed collection management tools and dynamic per-collection entry tools. The collection management tools come from the shared `@creel/tool-registry` catalog but remain tenant-gated in the service, so they do not appear in `tools/list` until the tenant has at least one collection. They remain discoverable through gateway `tools_search`.

For each collection belonging to the tenant, five dynamic entry tools are generated:

```
cms_entries_search_{collectionPublicId}
cms_entries_get_{collectionPublicId}
cms_entries_create_{collectionPublicId}
cms_entries_update_{collectionPublicId}
cms_entries_delete_{collectionPublicId}
```

Tool descriptions include the collection's `name` and a list of field labels sourced from the `fields` JSONB column, giving AI models full context about what data is available without extra round trips.

## Configuration

Environment variables:

- `HYPERDRIVE` - Cloudflare Hyperdrive binding
- `EVENTS_QUEUE` - Cloudflare Queue binding

## Development

```bash
pnpm dev --filter=@creel/cms
```

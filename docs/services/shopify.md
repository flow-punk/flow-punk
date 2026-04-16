# Shopify Service

## Overview

The Shopify service integrates with the Shopify Admin API for product management. It uses the OAuth service (via service binding) to obtain access tokens for authenticated Shopify API calls on behalf of tenants.

## API Endpoints

| Method | Path                    | Description                     |
| ------ | ----------------------- | ------------------------------- |
| `GET`  | `/shopify/products`     | List products from Shopify      |
| `POST` | `/shopify/products`     | Create product in Shopify       |
| `GET`  | `/shopify/products/:id` | Get product by ID               |
| `GET`  | `/mcp/tools`            | Returns tenant-scoped MCP tools |
| `POST` | `/mcp/execute`          | Executes Shopify MCP tools      |

## MCP Availability

Shopify tools are tenant-gated in `tools/list`; they become visible once the tenant has an active Shopify connection. They remain discoverable through gateway `tools_search`, which explains the missing connection and next setup step.

## Configuration

Environment variables:

- `OAUTH_SERVICE` - Service binding to OAuth service
- `EVENTS_QUEUE` - Cloudflare Queue binding

## Development

```bash
pnpm dev --filter=@creel/shopify
```

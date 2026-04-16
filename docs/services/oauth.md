# OAuth Service

## Overview

The OAuth service manages third-party authorization flows and token lifecycle. It handles OAuth2 authorize/callback flows, encrypted token storage, automatic token refresh, and connection management. Currently supports Shopify as a provider.

## API Endpoints

| Method   | Path                       | Description                           |
| -------- | -------------------------- | ------------------------------------- |
| `GET`    | `/oauth/authorize`         | Initiate OAuth authorization flow     |
| `GET`    | `/oauth/callback`          | Handle OAuth provider callback        |
| `GET`    | `/oauth/connections`       | List connections for tenant           |
| `GET`    | `/oauth/connections/:id`   | Get connection by ID                  |
| `DELETE` | `/oauth/connections/:id`   | Revoke/delete connection              |
| `GET`    | `/oauth/connections/token` | Get decrypted access token (internal) |

## Configuration

Environment variables:

- `HYPERDRIVE` - Cloudflare Hyperdrive binding
- `EVENTS_QUEUE` - Cloudflare Queue binding
- `ENCRYPTION_KEY` - Key for encrypting/decrypting tokens
- `SHOPIFY_CLIENT_ID` - Shopify OAuth app client ID
- `SHOPIFY_CLIENT_SECRET` - Shopify OAuth app client secret
- `GATEWAY_URL` - Gateway URL for callback redirect

## Development

```bash
pnpm dev --filter=@creel/oauth
```

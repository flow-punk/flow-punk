# Automations Service

## Overview

The Automations service manages workflow automation rules in the CRM. It processes event triggers, evaluates conditions, and executes actions based on configured workflows.

## API Endpoints

| Method | Path                       | Description                     |
| ------ | -------------------------- | ------------------------------- |
| `GET`  | `/automations`             | List workflows                  |
| `POST` | `/automations`             | Create workflow                 |
| `GET`  | `/automations/:id`         | Get workflow status             |
| `POST` | `/automations/:id/trigger` | Trigger workflow                |
| `POST` | `/automations/:id/enable`  | Enable workflow                 |
| `POST` | `/automations/:id/disable` | Disable workflow                |
| `GET`  | `/workflows`               | Alias for list/create routes    |
| `POST` | `/workflows`               | Alias for list/create routes    |
| `GET`  | `/workflows/:id`           | Alias for workflow status       |
| `POST` | `/workflows/:id/trigger`   | Alias for trigger route         |
| `POST` | `/workflows/:id/enable`    | Alias for enable route          |
| `POST` | `/workflows/:id/disable`   | Alias for disable route         |
| `GET`  | `/executions`              | List execution placeholder      |
| `GET`  | `/executions/:id`          | Get execution status            |
| `GET`  | `/mcp/tools`               | Returns tenant-scoped MCP tools |
| `POST` | `/mcp/execute`             | Executes Automations MCP tools  |

## MCP Availability

Automation tools are tenant-gated in `tools/list`; they become visible once the tenant has at least one workflow. They remain discoverable through gateway `tools_search`, which explains why a tool is unavailable and the next step to enable it.

## Webhooks

### Outgoing (Actions)

The `notify.webhook` action is fully implemented. Automation steps can use it to POST data to an external URL with custom headers.

### Incoming (Triggers)

The `webhook` trigger type is registered in the trigger registry and supports `path`, `method` (GET/POST), and `secret` config fields. However, the inbound HTTP listener is **not yet implemented**. What is missing:

- A route (e.g. `POST /automations/webhooks/:path`) to accept inbound requests from external systems
- Logic to look up which workflow owns a given `webhookPath`
- Optional secret validation against the `secret` trigger config field
- Gateway routing to expose the endpoint externally

Until this is built, external systems can trigger automations via `POST /automations/:id/trigger`.

## Configuration

Environment variables:

- `DATABASE_URL` - Database connection string
- `QUEUE_BINDING` - Cloudflare Queue binding name

## Development

```bash
pnpm dev --filter=@creel/automations
```

# Events Service

## Overview

The Events service is a queue consumer that persists domain events from Cloudflare Queues into the `events_log` table. It processes event batches, validates event structure, and handles malformed events gracefully (acks them to prevent infinite retry). This is not a REST API service — it primarily operates as a queue consumer.

## API Endpoints

| Method | Path      | Description  |
| ------ | --------- | ------------ |
| `GET`  | `/health` | Health check |

## Queue Consumer

Processes `MessageBatch<BaseEvent>` from Cloudflare Queues. Each event must have `id`, `type`, `tenantId`, and `timestamp` fields. Events are bulk-inserted into `events_log` with conflict-safe upserts.

## Configuration

Environment variables:

- `HYPERDRIVE` - Cloudflare Hyperdrive binding

## Development

```bash
pnpm dev --filter=@creel/events
```

# Pipeline Service

## Overview

The Pipeline service manages deals and sales pipeline stages in the CRM. It handles the complete deal lifecycle, including stage transitions, forecasting, and win/loss tracking.

## API Endpoints

| Method   | Path                    | Description                     |
| -------- | ----------------------- | ------------------------------- |
| `GET`    | `/pipelines`            | List pipelines                  |
| `POST`   | `/pipelines`            | Create pipeline                 |
| `GET`    | `/pipelines/:id`        | Get pipeline by ID              |
| `PATCH`  | `/pipelines/:id`        | Update pipeline                 |
| `PUT`    | `/pipelines/:id`        | Replace/update pipeline         |
| `DELETE` | `/pipelines/:id`        | Delete pipeline                 |
| `POST`   | `/pipelines/:id/stages` | Create stage in pipeline        |
| `PATCH`  | `/stages/:id`           | Update stage                    |
| `PUT`    | `/stages/:id`           | Replace/update stage            |
| `DELETE` | `/stages/:id`           | Delete stage                    |
| `GET`    | `/deals`                | List/search deals               |
| `POST`   | `/deals`                | Create deal                     |
| `GET`    | `/deals/:id`            | Get deal by ID                  |
| `PATCH`  | `/deals/:id`            | Update deal                     |
| `PUT`    | `/deals/:id`            | Replace/update deal             |
| `DELETE` | `/deals/:id`            | Delete deal                     |
| `POST`   | `/deals/:id/move`       | Change deal stage               |
| `POST`   | `/deals/:id/win`        | Mark deal as won                |
| `POST`   | `/deals/:id/lose`       | Mark deal as lost               |
| `GET`    | `/mcp/tools`            | Returns tenant-scoped MCP tools |
| `POST`   | `/mcp/execute`          | Executes Pipeline MCP tools     |

## MCP Availability

Pipeline tools are tenant-gated in `tools/list`; they become visible once the tenant has at least one pipeline. They remain discoverable through gateway `tools_search`, which provides a human-readable reason and next step when unavailable.

## Development

```bash
pnpm dev --filter=@creel/pipeline
```

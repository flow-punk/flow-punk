# FormInputs Service

## Overview

The FormInputs service provides a form builder and submission handling system. It manages form definitions, configurable form fields (with conditional logic and validation), and submission collection. Includes an MCP tool execution endpoint for AI assistant integration.

## API Endpoints

| Method   | Path                             | Description                              |
| -------- | -------------------------------- | ---------------------------------------- |
| `GET`    | `/forms`                         | Search/list forms                        |
| `POST`   | `/forms`                         | Create form                              |
| `GET`    | `/forms/:id`                     | Get form by ID                           |
| `PATCH`  | `/forms/:id`                     | Update form                              |
| `DELETE` | `/forms/:id`                     | Delete form                              |
| `GET`    | `/forms/:formId/fields`          | List fields for a form                   |
| `POST`   | `/forms/:formId/fields`          | Add field to form                        |
| `PATCH`  | `/forms/:formId/fields/:fieldId` | Update field                             |
| `DELETE` | `/forms/:formId/fields/:fieldId` | Delete field                             |
| `PUT`    | `/forms/:formId/fields/reorder`  | Reorder fields                           |
| `GET`    | `/submissions`                   | Search/list submissions                  |
| `POST`   | `/submissions`                   | Create submission                        |
| `GET`    | `/submissions/:id`               | Get submission by ID                     |
| `DELETE` | `/submissions/:id`               | Delete submission                        |
| `GET`    | `/mcp/tools`                     | Returns MCP tool definitions for gateway |
| `POST`   | `/mcp/execute`                   | MCP tool execution endpoint              |

## MCP Availability

Form, field, and submission tools are tenant-gated in `tools/list`; they become visible once the tenant has at least one form. They remain discoverable through gateway `tools_search`, which provides a human-readable reason and next step when unavailable.

## Configuration

Environment variables:

- `HYPERDRIVE` - Cloudflare Hyperdrive binding
- `EVENTS_QUEUE` - Cloudflare Queue binding

## Development

```bash
pnpm dev --filter=@creel/forminputs
```

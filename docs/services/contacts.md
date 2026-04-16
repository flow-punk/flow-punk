# Contacts Service

## Overview

The Contacts service is the deployable worker for contact and account management. It owns two internal subdomains:

- People/contacts (`services/contacts/src/people/`)
- Accounts/companies (`services/contacts/src/accounts/`)

The service exposes both canonical resource paths and compatibility aliases:

- People: `/people` and `/contacts`
- Accounts: `/accounts` and `/companies`

## API Endpoints

### People routes

| Method   | Path                | Description               |
| -------- | ------------------- | ------------------------- |
| `GET`    | `/people`           | List/search contacts      |
| `POST`   | `/people`           | Create contact            |
| `GET`    | `/people/:id`       | Get contact by ID         |
| `PATCH`  | `/people/:id`       | Update contact            |
| `PUT`    | `/people/:id`       | Replace/update contact    |
| `DELETE` | `/people/:id`       | Delete contact            |
| `GET`    | `/people/:id/notes` | List notes for a contact  |

Alias routes:

- `/contacts`
- `/contacts/:id`
- `/contacts/:id/notes`

### Account routes

| Method   | Path            | Description               |
| -------- | --------------- | ------------------------- |
| `GET`    | `/accounts`     | List/search accounts      |
| `POST`   | `/accounts`     | Create account            |
| `GET`    | `/accounts/:id` | Get account by ID         |
| `PATCH`  | `/accounts/:id` | Update account            |
| `PUT`    | `/accounts/:id` | Replace/update account    |
| `DELETE` | `/accounts/:id` | Delete account            |

Alias routes:

- `/companies`
- `/companies/:id`

### MCP endpoints

| Method | Path           | Description                            |
| ------ | -------------- | -------------------------------------- |
| `GET`  | `/mcp/tools`   | Returns tenant-scoped tool definitions |
| `POST` | `/mcp/execute` | Executes Contacts-owned MCP tools      |

## Notes

- `GET /people/:id/notes` currently returns an empty placeholder response in the worker entry point.
- Note/tag mutation routes are not implemented in the current service entry point and should not be documented as available endpoints.
- MCP tool discovery currently depends on tenant data in the live implementation, even though ADR-008 describes Contacts as a static service.

## Development

```bash
pnpm dev --filter=@creel/contacts
```

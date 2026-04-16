# Accounts Reference (within Contacts Service)

## Overview

Accounts management lives within the **contacts** service (`services/contacts/src/accounts/`). This page is a subdomain reference; the deployable service contract lives in `docs/services/contacts.md`.

## API Endpoints

| Method   | Path            | Description             |
| -------- | --------------- | ----------------------- |
| `GET`    | `/accounts`     | List/search accounts    |
| `POST`   | `/accounts`     | Create account          |
| `GET`    | `/accounts/:id` | Get account by ID       |
| `PATCH`  | `/accounts/:id` | Update account          |
| `PUT`    | `/accounts/:id` | Replace/update account  |
| `DELETE` | `/accounts/:id` | Delete account          |

Alias paths:

- `/companies`
- `/companies/:id`


## Development

```bash
pnpm dev --filter=@creel/contacts
```

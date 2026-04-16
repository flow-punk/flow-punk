# People Reference (within Contacts Service)

## Overview

People management lives within the **contacts** service (`services/contacts/src/people/`). This page is a subdomain reference; the deployable service contract lives in `docs/services/contacts.md`.

## API Endpoints

| Method   | Path                | Description                    |
| -------- | ------------------- | ------------------------------ |
| `GET`    | `/people`           | List/search contacts           |
| `POST`   | `/people`           | Create contact                 |
| `GET`    | `/people/:id`       | Get contact by ID              |
| `PATCH`  | `/people/:id`       | Update contact                 |
| `PUT`    | `/people/:id`       | Replace/update contact         |
| `DELETE` | `/people/:id`       | Delete contact                 |
| `GET`    | `/people/:id/notes` | List notes placeholder response |

Alias paths:

- `/contacts`
- `/contacts/:id`
- `/contacts/:id/notes`

Not currently implemented:

- `POST /people/:id/notes`
- `POST /people/:id/tags`

## Development

```bash
pnpm dev --filter=@creel/contacts
```

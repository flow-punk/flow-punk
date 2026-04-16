# Auth Service

## Overview

The Auth service handles identity, access management, and tenant administration. It manages authentication flows (login, signup, password reset), user management within tenants, role-based authorization, and API key management.

## API Endpoints

| Method   | Path                    | Description             |
| -------- | ----------------------- | ----------------------- |
| `POST`   | `/auth/login`           | User login              |
| `POST`   | `/auth/signup`          | User registration       |
| `POST`   | `/auth/forgot-password` | Initiate password reset |
| `POST`   | `/auth/reset-password`  | Complete password reset |
| `POST`   | `/auth/verify`          | Verify email/account    |
| `GET`    | `/tenants`              | List tenants            |
| `POST`   | `/tenants`              | Create tenant           |
| `GET`    | `/tenants/:id`          | Get tenant              |
| `PATCH`  | `/tenants/:id`          | Update tenant           |
| `GET`    | `/users`                | List users in tenant    |
| `POST`   | `/users`                | Create user             |
| `PATCH`  | `/users/:id`            | Update user             |
| `DELETE` | `/users/:id`            | Delete user             |
| `GET`    | `/roles`                | List roles              |
| `GET`    | `/api-keys`             | List API keys           |
| `POST`   | `/api-keys`             | Create API key          |
| `DELETE` | `/api-keys/:id`         | Revoke API key          |

## Configuration

Environment variables:

- `DATABASE_URL` - Database connection string
- `AUTH_SECRET` - JWT signing secret

## Development

```bash
pnpm dev --filter=@creel/auth
```

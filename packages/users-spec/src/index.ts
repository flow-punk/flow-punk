/**
 * OpenAPI fragment for users-core REST routes (`/api/v1/users/*`).
 *
 * Entity / Create / Patch schemas are derived from the Drizzle `users`
 * table. Source of truth: `indie/packages/db/src/schema/users.ts`.
 */

import { tableToSchemas } from '@flowpunk-indie/openapi-from-drizzle';
import {
  ALLOWED_PATCH_FIELDS,
  NULLABLE_PATCH_FIELDS,
  ROLE_VALUES,
  USER_STATUS_VALUES,
  users,
} from '@flowpunk-indie/db/schema/users';

const userSchemas = tableToSchemas(users, {
  name: 'User',
  enums: { status: USER_STATUS_VALUES, role: ROLE_VALUES },
  patch: { allowed: ALLOWED_PATCH_FIELDS, nullable: NULLABLE_PATCH_FIELDS },
});

const ERROR_REF = { $ref: '#/components/schemas/ErrorResponse' } as const;

const stdErrors = {
  '400': { description: 'Invalid input', content: { 'application/json': { schema: ERROR_REF } } },
  '401': { description: 'Unauthenticated', content: { 'application/json': { schema: ERROR_REF } } },
  '403': { description: 'Forbidden / admin required', content: { 'application/json': { schema: ERROR_REF } } },
  '404': { description: 'Not found', content: { 'application/json': { schema: ERROR_REF } } },
  '409': { description: 'Conflict (e.g., indie single-owner constraint)', content: { 'application/json': { schema: ERROR_REF } } },
} as const;

function listResponse(itemRef: string) {
  return {
    description: 'List of items',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: { type: 'array', items: { $ref: itemRef } },
          },
        },
      },
    },
  } as const;
}

function itemResponse(description: string, itemRef: string) {
  return {
    description,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: { $ref: itemRef },
          },
        },
      },
    },
  } as const;
}

function jsonBody(ref: string) {
  return {
    required: true,
    content: { 'application/json': { schema: { $ref: ref } } },
  } as const;
}

export const usersSpec = {
  tags: [
    {
      name: 'Users',
      description:
        'Tenant users (admin-managed). Indie enforces single-owner; managed allows multi-user per tenant.',
    },
  ],
  components: {
    schemas: { ...userSchemas },
  },
  paths: {
    '/api/v1/users': {
      get: {
        operationId: 'listUsers',
        summary: 'List users (admin only)',
        tags: ['Users'],
        responses: {
          '200': listResponse('#/components/schemas/User'),
          '401': stdErrors['401'],
          '403': stdErrors['403'],
        },
      },
      post: {
        operationId: 'createUser',
        summary: 'Invite/create a user (admin only)',
        tags: ['Users'],
        requestBody: jsonBody('#/components/schemas/UserCreate'),
        responses: {
          '201': itemResponse('User created', '#/components/schemas/User'),
          '400': stdErrors['400'],
          '401': stdErrors['401'],
          '403': stdErrors['403'],
          '409': stdErrors['409'],
        },
      },
    },
    '/api/v1/users/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      get: {
        operationId: 'getUser',
        summary: 'Get a user by ID (self or admin)',
        tags: ['Users'],
        responses: {
          '200': itemResponse('The requested user', '#/components/schemas/User'),
          '401': stdErrors['401'],
          '403': stdErrors['403'],
          '404': stdErrors['404'],
        },
      },
      patch: {
        operationId: 'updateUser',
        summary: 'Update a user (self or admin; non-admins limited to displayName/firstName/lastName)',
        tags: ['Users'],
        requestBody: jsonBody('#/components/schemas/UserPatch'),
        responses: {
          '200': itemResponse('User updated', '#/components/schemas/User'),
          '400': stdErrors['400'],
          '401': stdErrors['401'],
          '403': stdErrors['403'],
          '404': stdErrors['404'],
        },
      },
      delete: {
        operationId: 'deleteUser',
        summary: 'Soft-delete a user (admin only)',
        tags: ['Users'],
        responses: {
          '200': itemResponse('User soft-deleted', '#/components/schemas/User'),
          '401': stdErrors['401'],
          '403': stdErrors['403'],
          '404': stdErrors['404'],
        },
      },
    },
  },
} as const;

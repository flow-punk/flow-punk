/**
 * OpenAPI fragment for contacts-core REST routes (accounts + persons).
 *
 * Entity / Create / Patch schemas are **derived from the Drizzle table
 * definitions** in `@flowpunk-indie/db` via `@flowpunk-indie/openapi-from-drizzle`.
 * Source of truth for fields/types/nullability is the schema files; do not
 * hand-edit `Account*` or `Person*` schemas here.
 *
 * MCP routes (`/mcp/tools`, `/mcp/execute`) are intentionally NOT documented —
 * internal service-binding endpoints, not part of the public REST surface.
 *
 * Routes covered: per `indie/packages/contacts-core/src/router.ts`.
 */

import { tableToSchemas } from '@flowpunk-indie/openapi-from-drizzle';
import {
  ALLOWED_PATCH_FIELDS as ACCOUNT_PATCH,
  NULLABLE_PATCH_FIELDS as ACCOUNT_NULLABLE,
  accounts,
} from '@flowpunk-indie/db/schema/accounts';
import {
  ALLOWED_PATCH_FIELDS as PERSON_PATCH,
  EMAIL_CONSENT_VALUES,
  NULLABLE_PATCH_FIELDS as PERSON_NULLABLE,
  PHONE1_TYPE_VALUES,
  persons,
} from '@flowpunk-indie/db/schema/persons';

const ACCOUNT_STATUSES = ['active', 'deleted'] as const;
const PERSON_STATUSES = ['active', 'deleted'] as const;

const accountSchemas = tableToSchemas(accounts, {
  name: 'Account',
  enums: { status: ACCOUNT_STATUSES },
  patch: { allowed: ACCOUNT_PATCH, nullable: ACCOUNT_NULLABLE },
});

const personSchemas = tableToSchemas(persons, {
  name: 'Person',
  enums: {
    status: PERSON_STATUSES,
    phone1Type: PHONE1_TYPE_VALUES,
    consentEmail: EMAIL_CONSENT_VALUES,
  },
  patch: { allowed: PERSON_PATCH, nullable: PERSON_NULLABLE },
});

const ERROR_REF = { $ref: '#/components/schemas/ErrorResponse' } as const;

const stdErrors = {
  '400': { description: 'Invalid input', content: { 'application/json': { schema: ERROR_REF } } },
  '401': { description: 'Unauthenticated', content: { 'application/json': { schema: ERROR_REF } } },
  '404': { description: 'Not found', content: { 'application/json': { schema: ERROR_REF } } },
  '409': { description: 'Conflict', content: { 'application/json': { schema: ERROR_REF } } },
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

export const contactsSpec = {
  tags: [
    { name: 'Accounts', description: 'Companies / organizations.' },
    { name: 'Persons', description: 'Individual contacts (humans).' },
  ],
  components: {
    schemas: {
      ...accountSchemas,
      ...personSchemas,
    },
  },
  paths: {
    '/api/v1/accounts': {
      get: {
        operationId: 'listAccounts',
        summary: 'List accounts',
        tags: ['Accounts'],
        responses: {
          '200': listResponse('#/components/schemas/Account'),
          '401': stdErrors['401'],
        },
      },
      post: {
        operationId: 'createAccount',
        summary: 'Create an account',
        tags: ['Accounts'],
        requestBody: jsonBody('#/components/schemas/AccountCreate'),
        responses: {
          '201': itemResponse('Account created', '#/components/schemas/Account'),
          '400': stdErrors['400'],
          '401': stdErrors['401'],
          '409': stdErrors['409'],
        },
      },
    },
    '/api/v1/accounts/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      get: {
        operationId: 'getAccount',
        summary: 'Get an account by ID',
        tags: ['Accounts'],
        responses: {
          '200': itemResponse('The requested account', '#/components/schemas/Account'),
          '401': stdErrors['401'],
          '404': stdErrors['404'],
        },
      },
      patch: {
        operationId: 'updateAccount',
        summary: 'Update an account',
        tags: ['Accounts'],
        requestBody: jsonBody('#/components/schemas/AccountPatch'),
        responses: {
          '200': itemResponse('Account updated', '#/components/schemas/Account'),
          '400': stdErrors['400'],
          '401': stdErrors['401'],
          '404': stdErrors['404'],
        },
      },
      delete: {
        operationId: 'deleteAccount',
        summary: 'Soft-delete an account',
        tags: ['Accounts'],
        responses: {
          '200': itemResponse('Account soft-deleted', '#/components/schemas/Account'),
          '401': stdErrors['401'],
          '404': stdErrors['404'],
        },
      },
    },
    '/api/v1/persons': {
      get: {
        operationId: 'listPersons',
        summary: 'List persons',
        tags: ['Persons'],
        responses: {
          '200': listResponse('#/components/schemas/Person'),
          '401': stdErrors['401'],
        },
      },
      post: {
        operationId: 'createPerson',
        summary: 'Create a person',
        tags: ['Persons'],
        requestBody: jsonBody('#/components/schemas/PersonCreate'),
        responses: {
          '201': itemResponse('Person created', '#/components/schemas/Person'),
          '400': stdErrors['400'],
          '401': stdErrors['401'],
          '409': stdErrors['409'],
        },
      },
    },
    '/api/v1/persons/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      get: {
        operationId: 'getPerson',
        summary: 'Get a person by ID',
        tags: ['Persons'],
        responses: {
          '200': itemResponse('The requested person', '#/components/schemas/Person'),
          '401': stdErrors['401'],
          '404': stdErrors['404'],
        },
      },
      patch: {
        operationId: 'updatePerson',
        summary: 'Update a person',
        tags: ['Persons'],
        requestBody: jsonBody('#/components/schemas/PersonPatch'),
        responses: {
          '200': itemResponse('Person updated', '#/components/schemas/Person'),
          '400': stdErrors['400'],
          '401': stdErrors['401'],
          '404': stdErrors['404'],
        },
      },
      delete: {
        operationId: 'deletePerson',
        summary: 'Soft-delete a person',
        tags: ['Persons'],
        responses: {
          '200': itemResponse('Person soft-deleted', '#/components/schemas/Person'),
          '401': stdErrors['401'],
          '404': stdErrors['404'],
        },
      },
    },
  },
} as const;

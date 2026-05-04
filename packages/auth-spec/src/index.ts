/**
 * OpenAPI fragment for auth-core REST routes (`/api/v1/auth/keys/*`).
 *
 * `/auth/validate` is intentionally NOT documented — service-binding-internal.
 *
 * Schemas are hand-authored here (NOT derived from the Drizzle `apiKeys`
 * table) for two reasons:
 *  1. The response omits sensitive columns (`hash`, `userId`) and stamps
 *     a synthesized `tenantId` field — significantly transformed from the
 *     row shape.
 *  2. There is no PATCH endpoint on api-keys (immutable on create), so the
 *     `ALLOWED_PATCH_FIELDS` machinery doesn't apply.
 *
 * Source of truth for the routes: `indie/packages/auth-core/src/router.ts`.
 * Source of truth for the response shape: `serializeKey()` in the same file.
 */

const ERROR_REF = { $ref: '#/components/schemas/ErrorResponse' } as const;

export const authSpec = {
  tags: [
    {
      name: 'API Keys',
      description: 'Personal API key (`fpk_*`) lifecycle. Session-authenticated admin endpoints.',
    },
  ],
  components: {
    schemas: {
      ApiKey: {
        type: 'object',
        required: ['id', 'tenantId', 'label', 'prefix', 'scopes', 'createdAt'],
        properties: {
          id: { type: 'string' },
          tenantId: { type: 'string', description: 'Synthesized from the gateway-stamped tenant scope.' },
          label: { type: 'string' },
          prefix: { type: 'string', description: 'First 8 chars of the raw token (e.g., fpk_abcd).' },
          scopes: { type: 'array', items: { type: 'string', enum: ['read', 'write'] } },
          expiresAt: { type: ['string', 'null'], format: 'date-time' },
          lastUsedAt: { type: ['string', 'null'], format: 'date-time' },
          revokedAt: { type: ['string', 'null'], format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      ApiKeyCreate: {
        type: 'object',
        required: ['label', 'scopes'],
        additionalProperties: false,
        properties: {
          label: { type: 'string' },
          scopes: { type: 'array', items: { type: 'string', enum: ['read', 'write'] } },
          expiresAt: { type: ['string', 'null'], format: 'date-time' },
          rotatedFrom: {
            type: ['string', 'null'],
            description: 'ID of a revoked predecessor key, for rotation accounting.',
          },
        },
      },
      ApiKeyCreated: {
        allOf: [
          { $ref: '#/components/schemas/ApiKey' },
          {
            type: 'object',
            required: ['token'],
            properties: {
              token: {
                type: 'string',
                description: 'Raw `fpk_<scope>.<random>` token. Returned only at creation; not retrievable later.',
              },
            },
          },
        ],
      },
    },
  },
  paths: {
    '/api/v1/auth/keys': {
      get: {
        operationId: 'listApiKeys',
        summary: 'List API keys for the current user',
        tags: ['API Keys'],
        responses: {
          '200': {
            description: 'API keys owned by the current user',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['success', 'data'],
                  properties: {
                    success: { type: 'boolean', enum: [true] },
                    data: { type: 'array', items: { $ref: '#/components/schemas/ApiKey' } },
                  },
                },
              },
            },
          },
          '401': { description: 'Unauthenticated', content: { 'application/json': { schema: ERROR_REF } } },
          '403': { description: 'Session credential required', content: { 'application/json': { schema: ERROR_REF } } },
        },
      },
      post: {
        operationId: 'createApiKey',
        summary: 'Create a new API key',
        description: 'Returns the raw token only on creation. Store it immediately — it cannot be retrieved later.',
        tags: ['API Keys'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiKeyCreate' } } },
        },
        responses: {
          '201': {
            description: 'Key created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['success', 'data'],
                  properties: {
                    success: { type: 'boolean', enum: [true] },
                    data: { $ref: '#/components/schemas/ApiKeyCreated' },
                  },
                },
              },
            },
          },
          '400': { description: 'Invalid input', content: { 'application/json': { schema: ERROR_REF } } },
          '401': { description: 'Unauthenticated', content: { 'application/json': { schema: ERROR_REF } } },
          '403': { description: 'Session credential required', content: { 'application/json': { schema: ERROR_REF } } },
        },
      },
    },
    '/api/v1/auth/keys/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      get: {
        operationId: 'getApiKey',
        summary: 'Get an API key by ID',
        tags: ['API Keys'],
        responses: {
          '200': {
            description: 'The requested API key',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['success', 'data'],
                  properties: {
                    success: { type: 'boolean', enum: [true] },
                    data: { $ref: '#/components/schemas/ApiKey' },
                  },
                },
              },
            },
          },
          '401': { description: 'Unauthenticated', content: { 'application/json': { schema: ERROR_REF } } },
          '403': { description: 'Session credential required', content: { 'application/json': { schema: ERROR_REF } } },
          '404': { description: 'Not found', content: { 'application/json': { schema: ERROR_REF } } },
        },
      },
      delete: {
        operationId: 'revokeApiKey',
        summary: 'Revoke an API key',
        tags: ['API Keys'],
        responses: {
          '200': {
            description: 'Key revoked',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['success', 'data'],
                  properties: {
                    success: { type: 'boolean', enum: [true] },
                    data: { $ref: '#/components/schemas/ApiKey' },
                  },
                },
              },
            },
          },
          '401': { description: 'Unauthenticated', content: { 'application/json': { schema: ERROR_REF } } },
          '403': { description: 'Session credential required', content: { 'application/json': { schema: ERROR_REF } } },
          '404': { description: 'Not found', content: { 'application/json': { schema: ERROR_REF } } },
        },
      },
    },
  },
} as const;

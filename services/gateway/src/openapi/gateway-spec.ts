/**
 * OpenAPI fragment for gateway-owned routes (`/health`, `/mcp`) plus shared
 * components (ErrorResponse, BearerAuth security scheme) referenced by every
 * downstream service spec.
 *
 * `/docs` and `/openapi.json` are intentionally NOT documented here — they
 * are local-dev-only routes (gated by `OPENAPI_ENABLED`) and don't exist on
 * deployed surfaces.
 */

const errorResponse = {
  type: 'object',
  required: ['success', 'error'],
  properties: {
    success: { type: 'boolean', enum: [false] },
    error: {
      type: 'object',
      required: ['code'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
      },
    },
  },
} as const;

export const gatewaySpec = {
  tags: [
    { name: 'Gateway', description: 'Gateway-owned endpoints (health, MCP transport).' },
  ],
  components: {
    schemas: {
      ErrorResponse: errorResponse,
    },
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'API key in `Authorization: Bearer fpk_<scope>.<random>` header.',
      },
    },
  },
  paths: {
    '/health': {
      get: {
        operationId: 'health',
        summary: 'Liveness probe',
        description: 'Public. Always returns 200 when the gateway worker is reachable.',
        tags: ['Gateway'],
        security: [],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['status'],
                  properties: { status: { type: 'string', enum: ['ok'] } },
                },
              },
            },
          },
        },
      },
    },
    '/mcp': {
      post: {
        operationId: 'mcpRequest',
        summary: 'MCP JSON-RPC transport',
        description:
          'JSON-RPC 2.0 transport for MCP tools. Indie: API-key auth (`Bearer fpk_*`). ' +
          'Managed: OAuth bearer (`Bearer mcp_*`) with PKCE.',
        tags: ['Gateway'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['jsonrpc', 'method'],
                properties: {
                  jsonrpc: { type: 'string', enum: ['2.0'] },
                  id: {},
                  method: { type: 'string' },
                  params: { type: 'object', additionalProperties: true },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'JSON-RPC response',
            content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
          },
          '401': {
            description: 'Unauthenticated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
      get: {
        operationId: 'mcpStream',
        summary: 'MCP server-sent events stream',
        tags: ['Gateway'],
        responses: {
          '200': { description: 'SSE stream', content: { 'text/event-stream': {} } },
          '401': {
            description: 'Unauthenticated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
      delete: {
        operationId: 'mcpClose',
        summary: 'Close MCP session',
        tags: ['Gateway'],
        responses: {
          '204': { description: 'Session closed' },
          '401': {
            description: 'Unauthenticated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
  },
} as const;

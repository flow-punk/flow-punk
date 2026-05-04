/**
 * `/openapi.json` and `/docs` handlers for the indie gateway.
 *
 * Both routes are gated by `env.OPENAPI_ENABLED === '1'` at the router
 * level (see `middleware/router.ts`); these handlers assume the gate has
 * already passed.
 */

import { buildIndieSpec } from './indie-spec.js';
import { swaggerUiHtml } from './swagger-ui.js';

const SPEC_PATH = '/api/openapi.json';

export function handleOpenApi(): Response {
  return new Response(JSON.stringify(buildIndieSpec()), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

export function handleDocs(): Response {
  return new Response(swaggerUiHtml(SPEC_PATH), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

import assert from 'node:assert/strict';
import test from 'node:test';

import { handleDocs, handleOpenApi } from './handler.js';

test('handleOpenApi: returns 200 with JSON content-type', async () => {
  const response = handleOpenApi();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'application/json');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('handleOpenApi: body parses as a valid OpenAPI 3.1 document', async () => {
  const response = handleOpenApi();
  const body = (await response.json()) as {
    openapi: string;
    info: { title: string; version: string };
    paths: Record<string, unknown>;
  };
  assert.equal(body.openapi, '3.1.0');
  assert.equal(body.info.title, 'flow-punk Indie API');
  assert.ok(typeof body.info.version === 'string');
  assert.ok(typeof body.paths === 'object');
});

test('handleOpenApi: spec includes core indie routes from each fragment', async () => {
  const response = handleOpenApi();
  const body = (await response.json()) as { paths: Record<string, unknown> };
  // gateway-spec
  assert.ok(body.paths['/health'], '/health missing');
  assert.ok(body.paths['/mcp'], '/mcp missing');
  // contacts-spec
  assert.ok(body.paths['/api/v1/persons'], '/api/v1/persons missing');
  assert.ok(body.paths['/api/v1/accounts'], '/api/v1/accounts missing');
  // pipeline-spec
  assert.ok(body.paths['/api/v1/pipelines'], '/api/v1/pipelines missing');
  assert.ok(body.paths['/api/v1/stages'], '/api/v1/stages missing');
  assert.ok(body.paths['/api/v1/deals'], '/api/v1/deals missing');
  // users-spec
  assert.ok(body.paths['/api/v1/users'], '/api/v1/users missing');
  // auth-spec
  assert.ok(body.paths['/api/v1/auth/keys'], '/api/v1/auth/keys missing');
});

test('handleDocs: returns 200 with text/html content-type', async () => {
  const response = handleDocs();
  assert.equal(response.status, 200);
  const ct = response.headers.get('Content-Type') ?? '';
  assert.ok(ct.startsWith('text/html'), `unexpected Content-Type: ${ct}`);
});

test('handleDocs: HTML body bootstraps Swagger UI against /api/openapi.json', async () => {
  const response = handleDocs();
  const html = await response.text();
  assert.ok(html.includes('SwaggerUIBundle'), 'missing SwaggerUIBundle bootstrap');
  assert.ok(html.includes('/api/openapi.json'), 'missing spec URL reference');
  assert.ok(
    html.includes('persistAuthorization'),
    'missing persistAuthorization for API-key paste-and-Try',
  );
});

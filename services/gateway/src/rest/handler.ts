import type { AppContext } from '../types.js';
import {
  IDENTITY_HEADER_NAMES,
  REST_FORWARDED_REQUEST_HEADERS,
} from '../auth/identity-headers.js';
import {
  BodyTooLargeError,
  declaredContentLengthTooLarge,
  invalidBodyLimitResponse,
  parseMaxBodyBytes,
  readRequestBytesWithinLimit,
  requestTooLargeResponse,
} from '../body-size.js';
import { fetchWithServiceTimeout } from '../fetch-with-timeout.js';
import { invalidateToolsCacheIfRequired } from '../mcp/index.js';

/**
 * REST route handler.
 * Path-prefix dispatch to domain services via service bindings:
 *   /api/v1/persons/*     → CONTACTS_SERVICE
 *   /api/v1/accounts/*    → CONTACTS_SERVICE
 *   /api/v1/deals/*       → PIPELINE_SERVICE
 *   /api/v1/pipelines/*   → PIPELINE_SERVICE
 *   /api/v1/stages/*      → PIPELINE_SERVICE
 *   /api/v1/automations/* → AUTOMATIONS_SERVICE
 *   /api/v1/workflows/*   → AUTOMATIONS_SERVICE
 *   /api/v1/forms/*       → FORMINPUTS_SERVICE
 *   /api/v1/collections/* → CMS_SERVICE
 *   /api/v1/entries/*     → CMS_SERVICE
 *   /api/v1/shopify/*     → SHOPIFY_SERVICE  (managed-only)
 *   /api/v1/tenants/*     → TENANTS_SERVICE  (managed-only)
 *
 * Managed-only routes are resolved via a typed cast over `ctx.env`; the
 * binding is null when running indie standalone.
 *
 * Enforces request-size check (MAX_REQUEST_BODY_BYTES) before body read/forward.
 * Forwards as http://internal{path}{query} — no external DNS, no TLS overhead.
 */
export async function handleRest(ctx: AppContext): Promise<Response> {
  const maxBytes = parseMaxBodyBytes(ctx.env.MAX_REQUEST_BODY_BYTES);
  if (maxBytes === null) return invalidBodyLimitResponse(ctx.requestId);
  if (declaredContentLengthTooLarge(ctx.request.headers, maxBytes)) {
    return requestTooLargeResponse(maxBytes, ctx.requestId);
  }

  const target = bindingForPath(new URL(ctx.request.url).pathname, ctx);
  if (!target) return new Response('Not Found', { status: 404 });

  const headers = buildForwardHeaders(ctx.request.headers, ctx.requestId);
  let forwardedRequest: Request;
  if (ctx.request.method !== 'GET' && ctx.request.method !== 'HEAD') {
    try {
      const body = await readRequestBytesWithinLimit(ctx.request, maxBytes);
      headers.delete('Content-Length');

      // Construct from URL+init (not from ctx.request) so we don't fall back
      // to ctx.request.body — which readRequestBytesWithinLimit just consumed.
      // For empty bodies use `null`, not `new Uint8Array(0)`, so we forward
      // "no body" rather than a present zero-length body stream.
      forwardedRequest = new Request(ctx.request.url, {
        method: ctx.request.method,
        headers,
        body: body.byteLength === 0 ? null : body,
      });
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        return requestTooLargeResponse(maxBytes, ctx.requestId);
      }
      throw error;
    }
  } else {
    forwardedRequest = new Request(ctx.request, { headers });
  }

  const response = await fetchWithServiceTimeout(
    target,
    new Request(
      `http://internal${new URL(ctx.request.url).pathname}${new URL(ctx.request.url).search}`,
      forwardedRequest,
    ),
    undefined,
    ctx.env.SERVICE_TIMEOUT_MS,
  );

  await invalidateToolsCacheIfRequired(response.headers, ctx);
  return response;
}

function buildForwardHeaders(
  sourceHeaders: Headers,
  requestId: string,
): Headers {
  const headers = new Headers();
  const contentType = sourceHeaders.get('Content-Type');
  if (contentType) headers.set('Content-Type', contentType);
  headers.set('X-Request-ID', requestId);

  for (const name of IDENTITY_HEADER_NAMES) {
    const value = sourceHeaders.get(name);
    if (value) headers.set(name, value);
  }
  for (const name of REST_FORWARDED_REQUEST_HEADERS) {
    const value = sourceHeaders.get(name);
    if (value) headers.set(name, value);
  }

  return headers;
}

export function bindingForPath(pathname: string, ctx: AppContext): Fetcher | null {
  if (
    pathname === '/api/v1/persons' ||
    pathname.startsWith('/api/v1/persons/') ||
    pathname === '/api/v1/accounts' ||
    pathname.startsWith('/api/v1/accounts/')
  ) {
    return ctx.env.CONTACTS_SERVICE;
  }
  if (
    pathname.startsWith('/api/v1/deals/') ||
    pathname.startsWith('/api/v1/pipelines/') ||
    pathname.startsWith('/api/v1/stages/')
  ) {
    return ctx.env.PIPELINE_SERVICE;
  }
  if (
    pathname.startsWith('/api/v1/automations/') ||
    pathname.startsWith('/api/v1/workflows/')
  ) {
    return ctx.env.AUTOMATIONS_SERVICE;
  }
  if (pathname.startsWith('/api/v1/forms/')) {
    return ctx.env.FORMINPUTS_SERVICE;
  }
  if (
    pathname.startsWith('/api/v1/collections/') ||
    pathname.startsWith('/api/v1/entries/')
  ) {
    return ctx.env.CMS_SERVICE;
  }
  if (pathname.startsWith('/api/v1/auth/')) {
    return ctx.env.AUTH_SERVICE;
  }

  const managedEnv = ctx.env as AppContext['env'] & {
    SHOPIFY_SERVICE?: Fetcher;
    TENANTS_SERVICE?: Fetcher;
  };
  if (pathname.startsWith('/api/v1/shopify/')) {
    return managedEnv.SHOPIFY_SERVICE ?? null;
  }
  if (
    pathname === '/api/v1/tenants' ||
    pathname.startsWith('/api/v1/tenants/')
  ) {
    return managedEnv.TENANTS_SERVICE ?? null;
  }

  return null;
}

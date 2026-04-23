import type { AppContext } from '../types.js';
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
 *   /api/v1/people/*      → CONTACTS_SERVICE
 *   /api/v1/accounts/*    → CONTACTS_SERVICE
 *   /api/v1/deals/*       → PIPELINE_SERVICE
 *   /api/v1/pipelines/*   → PIPELINE_SERVICE
 *   /api/v1/stages/*      → PIPELINE_SERVICE
 *   /api/v1/automations/* → AUTOMATIONS_SERVICE
 *   /api/v1/workflows/*   → AUTOMATIONS_SERVICE
 *   /api/v1/forms/*       → FORMINPUTS_SERVICE
 *   /api/v1/collections/* → CMS_SERVICE
 *   /api/v1/entries/*     → CMS_SERVICE
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

  let forwardedRequest = ctx.request;
  if (ctx.request.method !== 'GET' && ctx.request.method !== 'HEAD') {
    try {
      const body = await readRequestBytesWithinLimit(ctx.request, maxBytes);
      const headers = new Headers(ctx.request.headers);
      headers.delete('Content-Length');

      forwardedRequest = new Request(ctx.request, {
        headers,
        body: body.byteLength === 0 ? undefined : body,
      });
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        return requestTooLargeResponse(maxBytes, ctx.requestId);
      }
      throw error;
    }
  }

  const response = await fetchWithServiceTimeout(
    target,
    `http://internal${new URL(ctx.request.url).pathname}${new URL(ctx.request.url).search}`,
    forwardedRequest,
    ctx.env.SERVICE_TIMEOUT_MS,
  );

  await invalidateToolsCacheIfRequired(response.headers, ctx);
  return response;
}

function bindingForPath(pathname: string, ctx: AppContext): Fetcher | null {
  if (
    pathname.startsWith('/api/v1/people/') ||
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
  };
  if (pathname.startsWith('/api/v1/shopify/')) {
    return managedEnv.SHOPIFY_SERVICE ?? null;
  }

  return null;
}

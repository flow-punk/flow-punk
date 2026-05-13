/**
 * Forwarder for the better-auth surface (`/api/auth/*`).
 *
 * Codex-QA finding: prior to this file, `/api/auth/*` was admitted by
 * `INDIE_PUBLIC_PATHS` but never dispatched anywhere — `dispatchIndieRoute`
 * only matched `/api/v1/*`, `/mcp`, `/oauth/*`, `/health`, and the
 * `.well-known` discovery surfaces. Result: every dashboard call to
 * `/api/auth/get-session` etc. 404'd. This handler is the missing link.
 *
 * Why not reuse `handleRest`:
 *   - REST identity-header forwarding intentionally drops `Cookie`; the
 *     better-auth surface is the one place where the gateway MUST pass
 *     the Cookie through to the downstream service.
 *   - REST has no host-resolution step; better-auth on managed needs
 *     `X-Tenant-Id` stamped from the inbound host so the auth worker
 *     picks the right tenant D1.
 *
 * Managed adds host resolution by passing `tenantIdStamp`; indie does
 * not need it (single bound D1).
 */
import type { AppContext } from './types.js';
import {
  BodyTooLargeError,
  declaredContentLengthTooLarge,
  invalidBodyLimitResponse,
  parseMaxBodyBytes,
  readRequestBytesWithinLimit,
  requestTooLargeResponse,
} from './body-size.js';
import { fetchWithServiceTimeout } from './fetch-with-timeout.js';
import { stripIdentityHeadersFromRequest } from './auth/identity-headers.js';

export interface HandleBetterAuthInput {
  /**
   * Header value to stamp as `X-Tenant-Id` on the forwarded request.
   * Indie always passes `_system`; managed passes the host-resolved
   * tenant id, or omits and sets `consoleAuth` to mark console-host
   * requests.
   */
  tenantIdStamp?: string;
  /** When true, stamps `X-Console-Auth: 1` instead of `X-Tenant-Id`. */
  consoleAuth?: boolean;
}

export async function handleBetterAuth(
  ctx: AppContext,
  input: HandleBetterAuthInput = {},
): Promise<Response> {
  const maxBytes = parseMaxBodyBytes(ctx.env.MAX_REQUEST_BODY_BYTES);
  if (maxBytes === null) return invalidBodyLimitResponse(ctx.requestId);
  if (declaredContentLengthTooLarge(ctx.request.headers, maxBytes)) {
    return requestTooLargeResponse(maxBytes, ctx.requestId);
  }

  // Always strip client-supplied identity headers; better-auth uses
  // cookies for auth, not the gateway identity stamps. Public-path
  // middleware also strips, but this is defensive against future
  // chain reorders.
  const sourceRequest = stripIdentityHeadersFromRequest(ctx.request);

  const headers = new Headers();
  const contentType = sourceRequest.headers.get('Content-Type');
  if (contentType) headers.set('Content-Type', contentType);
  const cookie = sourceRequest.headers.get('Cookie');
  if (cookie) headers.set('Cookie', cookie);
  const userAgent = sourceRequest.headers.get('User-Agent');
  if (userAgent) headers.set('User-Agent', userAgent);
  headers.set('X-Request-ID', ctx.requestId);
  if (input.consoleAuth) {
    headers.set('X-Console-Auth', '1');
  } else if (input.tenantIdStamp) {
    headers.set('X-Tenant-Id', input.tenantIdStamp);
  }

  let forwardedRequest: Request;
  if (sourceRequest.method !== 'GET' && sourceRequest.method !== 'HEAD') {
    try {
      const body = await readRequestBytesWithinLimit(sourceRequest, maxBytes);
      forwardedRequest = new Request(sourceRequest.url, {
        method: sourceRequest.method,
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
    forwardedRequest = new Request(sourceRequest, { headers });
  }

  const url = new URL(sourceRequest.url);
  return fetchWithServiceTimeout(
    ctx.env.AUTH_SERVICE,
    new Request(`http://internal${url.pathname}${url.search}`, forwardedRequest),
    undefined,
    ctx.env.SERVICE_TIMEOUT_MS,
  );
}

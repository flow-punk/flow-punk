import type { Env, Middleware } from '../types.js';

const ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
const ALLOWED_HEADERS = 'Authorization, Content-Type, X-Request-ID';
const EXPOSED_HEADERS = 'X-Request-ID';
const MAX_AGE = '600';

const allowlistCache = new WeakMap<Env, Set<string>>();

function getAllowlist(env: Env): Set<string> {
  let set = allowlistCache.get(env);
  if (!set) {
    set = parseAllowedOrigins(env.ALLOWED_ORIGINS ?? '');
    allowlistCache.set(env, set);
  }
  return set;
}

function parseAllowedOrigins(raw: string): Set<string> {
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );
}

function isPreflight(req: Request): boolean {
  return (
    req.method === 'OPTIONS' &&
    req.headers.get('Access-Control-Request-Method') !== null
  );
}

function appendVary(headers: Headers, value: string): void {
  const existing = headers.get('Vary');
  if (!existing) {
    headers.set('Vary', value);
    return;
  }
  const tokens = existing.split(',').map((s) => s.trim());
  if (!tokens.some((t) => t.toLowerCase() === value.toLowerCase())) {
    headers.set('Vary', `${existing}, ${value}`);
  }
}

/**
 * CORS middleware — slot 1.
 *
 * Exact-match allowlist from Env.ALLOWED_ORIGINS (comma-separated). Empty
 * allowlist denies all cross-origin; requests without an Origin header always
 * pass through untouched (same-origin, server-to-server, health checks).
 *
 * Disallowed origins are not rejected with 403: preflights return 204 with
 * no ACAO and actual requests pass through with no ACAO, letting the browser
 * block. Avoids leaking allowlist membership and avoids breaking same-site
 * tools that happen to send Origin.
 */
export const corsMiddleware: Middleware = async (ctx, next) => {
  const origin = ctx.request.headers.get('Origin');
  if (!origin) return next();

  const allowlist = getAllowlist(ctx.env);
  const allowed = allowlist.has(origin);

  if (isPreflight(ctx.request)) {
    const headers = new Headers();
    appendVary(headers, 'Origin');
    if (allowed) {
      headers.set('Access-Control-Allow-Origin', origin);
      headers.set('Access-Control-Allow-Credentials', 'true');
      headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS);
      headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS);
      headers.set('Access-Control-Max-Age', MAX_AGE);
    }
    return new Response(null, { status: 204, headers });
  }

  const res = await next();
  const headers = new Headers(res.headers);
  appendVary(headers, 'Origin');
  if (allowed) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set('Access-Control-Expose-Headers', EXPOSED_HEADERS);
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
};

/**
 * Idempotency middleware for write requests.
 *
 * Caches successful (status < 500) responses keyed on a tuple of
 * `(method, pathname, scopeKey, idempotency-key)` plus a hash of the request
 * body. Reusing the same key with a different request body returns
 * `422 IDEMPOTENCY_KEY_REUSED` (Stripe-style contract) — this prevents both
 * stale-success replays across different payloads and corrected-body-pinned-
 * to-stale-4xx footguns.
 *
 * Header: `X-Idempotency-Key`. Empty/over-length keys → 400.
 *
 * Sets `Idempotency-Replayed: true` on cached responses so callers/tests
 * can distinguish fresh vs cached.
 *
 * The helper reads the body via `request.clone().arrayBuffer()` so the inner
 * handler still sees a fresh, unconsumed body. Handlers must NOT pre-read
 * the body before `withIdempotency` runs.
 */

const DEFAULT_TTL_SECONDS = 24 * 60 * 60;
const DEFAULT_HEADER_NAME = 'X-Idempotency-Key';
const DEFAULT_MAX_KEY_LENGTH = 255;
const REPLAY_HEADER = 'Idempotency-Replayed';

/**
 * Minimal structural KV interface so this package avoids a hard dependency
 * on `@cloudflare/workers-types`. Real Cloudflare `KVNamespace` is a
 * structural supertype.
 */
export interface IdempotencyKvNamespace {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
}

export interface IdempotencyOptions {
  /** Caller-provided isolation key, e.g. `${tenantId}:${userId}`. Required. */
  scopeKey: string;
  /** Defaults to 'X-Idempotency-Key'. */
  headerName?: string;
  /** Defaults to 24h. */
  ttlSeconds?: number;
  /** Defaults to 255. */
  maxKeyLength?: number;
}

interface CachedResponse {
  status: number;
  headers: Array<[string, string]>;
  body: string;
  requestBodyHash: string;
}

export async function withIdempotency(
  request: Request,
  kv: IdempotencyKvNamespace,
  handler: () => Promise<Response>,
  options: IdempotencyOptions,
): Promise<Response> {
  const headerName = options.headerName ?? DEFAULT_HEADER_NAME;
  const maxKeyLength = options.maxKeyLength ?? DEFAULT_MAX_KEY_LENGTH;
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;

  const idempotencyKey = request.headers.get(headerName);

  // Header absent → bypass caching. Mutations without an idempotency key
  // execute as normal (caller is opting out of idempotent semantics).
  if (idempotencyKey === null) {
    return handler();
  }

  if (idempotencyKey.length === 0 || idempotencyKey.length > maxKeyLength) {
    return jsonResponse(400, {
      success: false,
      error: {
        code: 'INVALID_IDEMPOTENCY_KEY',
        message: `${headerName} must be between 1 and ${maxKeyLength} characters.`,
      },
    });
  }

  const url = new URL(request.url);
  const bodyBytes = await request.clone().arrayBuffer();
  const requestBodyHash = await sha256Hex(bodyBytes);
  const cacheKey = await buildCacheKey(
    request.method,
    url.pathname,
    options.scopeKey,
    idempotencyKey,
  );

  const cached = await readCache(kv, cacheKey);
  if (cached) {
    if (cached.requestBodyHash !== requestBodyHash) {
      return jsonResponse(422, {
        success: false,
        error: {
          code: 'IDEMPOTENCY_KEY_REUSED',
          message:
            `${headerName} was previously used with a different request payload.`,
        },
      });
    }
    return reviveCachedResponse(cached);
  }

  const response = await handler();

  if (response.status < 500) {
    const stored = await materializeForCache(response, requestBodyHash);
    await writeCache(kv, cacheKey, stored, ttlSeconds);
    return reviveStoredButFresh(stored);
  }

  return response;
}

async function buildCacheKey(
  method: string,
  pathname: string,
  scopeKey: string,
  idempotencyKey: string,
): Promise<string> {
  const composite = `${method.toUpperCase()}:${pathname}:${scopeKey}:${idempotencyKey}`;
  return `idemp:${await sha256Hex(composite)}`;
}

async function readCache(
  kv: IdempotencyKvNamespace,
  cacheKey: string,
): Promise<CachedResponse | null> {
  try {
    const raw = await kv.get(cacheKey);
    if (!raw) return null;
    return JSON.parse(raw) as CachedResponse;
  } catch {
    return null;
  }
}

async function writeCache(
  kv: IdempotencyKvNamespace,
  cacheKey: string,
  value: CachedResponse,
  ttlSeconds: number,
): Promise<void> {
  try {
    await kv.put(cacheKey, JSON.stringify(value), {
      expirationTtl: ttlSeconds,
    });
  } catch {
    // Cache writes are best-effort; correctness lives in the handler. A KV
    // write failure should not propagate to the caller.
  }
}

async function materializeForCache(
  response: Response,
  requestBodyHash: string,
): Promise<CachedResponse> {
  const body = await response.clone().text();
  const headers: Array<[string, string]> = [];
  response.headers.forEach((value, key) => {
    headers.push([key, value]);
  });
  return {
    status: response.status,
    headers,
    body,
    requestBodyHash,
  };
}

function reviveCachedResponse(cached: CachedResponse): Response {
  const headers = new Headers(cached.headers);
  headers.set(REPLAY_HEADER, 'true');
  return new Response(cached.body, {
    status: cached.status,
    headers,
  });
}

function reviveStoredButFresh(stored: CachedResponse): Response {
  // First execution — return the response we just produced. We rebuild from
  // the materialized form to ensure the response body is readable for tests
  // (the original Response body has already been consumed by `materializeForCache`).
  return new Response(stored.body, {
    status: stored.status,
    headers: new Headers(stored.headers),
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function sha256Hex(input: string | ArrayBuffer): Promise<string> {
  const data =
    typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const buf = await crypto.subtle.digest('SHA-256', data);
  let out = '';
  for (const b of new Uint8Array(buf)) {
    out += b.toString(16).padStart(2, '0');
  }
  return out;
}

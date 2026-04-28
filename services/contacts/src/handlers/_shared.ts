import { drizzle } from 'drizzle-orm/d1';

import type { ContactsEnv } from '../types.js';

export function getDb(env: ContactsEnv) {
  return drizzle(env.DB);
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function errorResponse(
  status: number,
  code: string,
  message?: string,
  details?: Record<string, unknown>,
): Response {
  return jsonResponse(status, {
    success: false,
    error: {
      code,
      ...(message ? { message } : {}),
      ...(details ? { details } : {}),
    },
  });
}

export function badRequest(
  code: string,
  message?: string,
  details?: Record<string, unknown>,
): Response {
  return errorResponse(400, code, message, details);
}

export function notFound(code = 'NOT_FOUND'): Response {
  return errorResponse(404, code);
}

export type ReadJsonResult<T> =
  | { kind: 'none' }
  | { kind: 'malformed' }
  | { kind: 'parsed'; value: T };

/**
 * Discriminated body read.
 *
 * - `none`: no JSON content-type (or empty body) — caller decides whether to
 *   treat as 400 (required body) or proceed (optional body).
 * - `malformed`: content-type was JSON but parsing failed — always 400.
 * - `parsed`: success.
 */
export async function tryReadJson<T>(
  request: Request,
): Promise<ReadJsonResult<T>> {
  const contentType = request.headers.get('Content-Type') ?? '';
  if (!contentType.includes('application/json')) return { kind: 'none' };
  try {
    return { kind: 'parsed', value: (await request.json()) as T };
  } catch {
    return { kind: 'malformed' };
  }
}

/**
 * Helper for endpoints that REQUIRE a JSON body. Returns a `Response`
 * directly when body is missing or malformed; otherwise returns
 * `{ kind: 'ok', value }`.
 */
export async function requireJsonBody<T>(
  request: Request,
): Promise<{ kind: 'ok'; value: T } | { kind: 'err'; response: Response }> {
  const result = await tryReadJson<T>(request);
  if (result.kind === 'parsed') return { kind: 'ok', value: result.value };
  return {
    kind: 'err',
    response: badRequest('INVALID_BODY', 'request body must be JSON'),
  };
}

export function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

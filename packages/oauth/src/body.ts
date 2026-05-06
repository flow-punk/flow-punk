import {
  BodyTooLargeError,
  declaredContentLengthTooLarge,
  invalidBodyLimitResponse,
  parseMaxBodyBytes,
  readRequestTextWithinLimit,
  requestTooLargeResponse,
} from './_lib/body-size.js';

import { isFormUrlEncodedRequest } from './responses.js';

/**
 * Reads a request body bounded by `MAX_REQUEST_BODY_BYTES`. Returns the
 * text, or a Response (4xx) on declared/observed-body-too-large.
 */
export async function readBody(
  request: Request,
  env: { MAX_REQUEST_BODY_BYTES?: string },
  requestId: string,
): Promise<string | Response> {
  const maxBytes = parseMaxBodyBytes(env.MAX_REQUEST_BODY_BYTES ?? '');
  if (maxBytes === null) return invalidBodyLimitResponse(requestId);
  if (declaredContentLengthTooLarge(request.headers, maxBytes)) {
    return requestTooLargeResponse(maxBytes, requestId);
  }
  try {
    return await readRequestTextWithinLimit(request, maxBytes);
  } catch (err) {
    if (err instanceof BodyTooLargeError) {
      return requestTooLargeResponse(maxBytes, requestId);
    }
    throw err;
  }
}

export async function safeJson(
  request: Request,
  env: { MAX_REQUEST_BODY_BYTES?: string },
  requestId: string,
): Promise<unknown | Response | null> {
  const body = await readBody(request, env, requestId);
  if (body instanceof Response) return body;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

export async function safeFormUrlEncoded(
  request: Request,
  env: { MAX_REQUEST_BODY_BYTES?: string },
  requestId: string,
): Promise<FormData | Response | null> {
  if (!isFormUrlEncodedRequest(request)) return null;
  const body = await readBody(request, env, requestId);
  if (body instanceof Response) return body;
  try {
    const params = new URLSearchParams(body);
    const form = new FormData();
    for (const [k, v] of params) form.append(k, v);
    return form;
  } catch {
    return null;
  }
}

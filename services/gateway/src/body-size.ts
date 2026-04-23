const textDecoder = new TextDecoder();

export class BodyTooLargeError extends Error {
  constructor(public readonly maxBytes: number) {
    super(`body exceeds ${maxBytes} bytes`);
    this.name = 'BodyTooLargeError';
  }
}

export function parseMaxBodyBytes(rawValue: string): number | null {
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export function invalidBodyLimitResponse(requestId: string): Response {
  return new Response(
    JSON.stringify({ error: 'invalid_body_limit_configuration' }),
    {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
      },
    },
  );
}

export function requestTooLargeResponse(
  maxBytes: number,
  requestId: string,
): Response {
  return new Response(
    JSON.stringify({ error: 'request_too_large', maxBytes }),
    {
      status: 413,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
      },
    },
  );
}

export function declaredContentLengthTooLarge(
  headers: Headers,
  maxBytes: number,
): boolean {
  const contentLength = headers.get('Content-Length');
  if (!contentLength) return false;

  const declaredLength = Number(contentLength);
  return Number.isFinite(declaredLength) && declaredLength > maxBytes;
}

export async function readRequestTextWithinLimit(
  request: Request,
  maxBytes: number,
): Promise<string> {
  const bytes = await readReadableStreamWithinLimit(request.body, maxBytes);
  return textDecoder.decode(bytes);
}

export async function readResponseBytesWithinLimit(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  return readReadableStreamWithinLimit(response.body, maxBytes);
}

export async function readRequestBytesWithinLimit(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array> {
  return readReadableStreamWithinLimit(request.body, maxBytes);
}

async function readReadableStreamWithinLimit(
  stream: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!stream) return new Uint8Array();

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        throw new BodyTooLargeError(maxBytes);
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return merged;
}

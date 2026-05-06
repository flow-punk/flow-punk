import { CfAdminError, classifyHttpStatus } from './errors.js';

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

export interface CfClientConfig {
  apiToken: string;
  accountId: string;
  /** Injectable for tests. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Optional override for the API base URL (sandbox testing). */
  baseUrl?: string;
}

export interface CfClient {
  readonly accountId: string;
  readonly baseUrl: string;
  /** Path is relative to `baseUrl`, e.g. `/accounts/{id}/d1/database`. */
  request(path: string, init?: RequestInit): Promise<Response>;
}

interface CfEnvelopeError {
  code: number;
  message: string;
}

interface CfEnvelope<T = unknown> {
  success: boolean;
  errors?: CfEnvelopeError[];
  messages?: CfEnvelopeError[];
  result?: T;
  result_info?: unknown;
}

export function createCfClient(config: CfClientConfig): CfClient {
  if (!config.apiToken) {
    throw new CfAdminError('invalid_input', 'apiToken is required');
  }
  if (!config.accountId) {
    throw new CfAdminError('invalid_input', 'accountId is required');
  }
  const fetchImpl = config.fetch ?? globalThis.fetch.bind(globalThis);
  const baseUrl = config.baseUrl ?? CF_API_BASE;

  return {
    accountId: config.accountId,
    baseUrl,
    async request(path, init = {}) {
      const url = path.startsWith('http')
        ? path
        : `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${config.apiToken}`);
      // Don't set Content-Type if the caller passed FormData — fetch sets the
      // multipart boundary automatically.
      if (
        !headers.has('Content-Type') &&
        init.body !== undefined &&
        !(init.body instanceof FormData) &&
        typeof init.body !== 'undefined'
      ) {
        headers.set('Content-Type', 'application/json');
      }
      return fetchImpl(url, { ...init, headers });
    },
  };
}

/**
 * Parse a Cloudflare envelope response and unwrap `result`. Throws a typed
 * `CfAdminError` on non-success.
 */
export async function parseEnvelope<T>(response: Response): Promise<T> {
  let payload: CfEnvelope<T>;
  const contentType = response.headers.get('Content-Type') ?? '';
  if (!contentType.includes('application/json')) {
    if (!response.ok) {
      throw new CfAdminError(
        classifyHttpStatus(response.status),
        `CF API non-JSON error response (status ${response.status})`,
        response.status,
      );
    }
    throw new CfAdminError(
      'invalid_response',
      `Expected JSON envelope, got Content-Type=${contentType}`,
      response.status,
    );
  }
  try {
    payload = (await response.json()) as CfEnvelope<T>;
  } catch (err) {
    throw new CfAdminError(
      'invalid_response',
      `CF API returned malformed JSON: ${(err as Error).message}`,
      response.status,
    );
  }
  if (!response.ok || !payload.success) {
    const cfErrors = payload.errors ?? [];
    throw new CfAdminError(
      classifyHttpStatus(response.status),
      cfErrors.length
        ? cfErrors.map((e) => `[${e.code}] ${e.message}`).join('; ')
        : `CF API error (status ${response.status})`,
      response.status,
      cfErrors,
    );
  }
  if (payload.result === undefined) {
    throw new CfAdminError(
      'invalid_response',
      'CF API success response missing `result` field',
      response.status,
    );
  }
  return payload.result;
}

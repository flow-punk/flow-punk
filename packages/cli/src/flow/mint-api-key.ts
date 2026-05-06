import { CliError } from '../util/errors.js';

/**
 * Mint the first API key for the new admin user, by hitting the deployed
 * indie gateway with the just-printed session cookie. Indie's auth-core
 * exposes `POST /api/v1/auth/keys` (admin-only key creation, response
 * shape `{ success, data: { ...key, token } }`).
 *
 * Returns the cleartext API key string ONCE — caller prints it and never
 * persists.
 */

export interface MintApiKeyInput {
  gatewayUrl: string;
  cookieValue: string;
  /** Human-readable label for the key (shows up in admin listings). */
  label?: string;
}

export interface MintApiKeyOutput {
  apiKey: string;
}

export async function mintApiKey(input: MintApiKeyInput): Promise<MintApiKeyOutput> {
  const url = `${stripTrailingSlash(input.gatewayUrl)}/api/v1/auth/keys`;
  // Indie auth-core only accepts `read` and `write` scopes. The first key
  // ships with both so the operator can immediately do CRUD via REST and
  // MCP without needing to mint a second key.
  const body = {
    label: input.label ?? 'flowpunk init',
    scopes: ['read', 'write'],
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `fp_session=${input.cookieValue}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new CliError(
      `Mint API key failed (status ${res.status})`,
      `Gateway responded: ${text.slice(0, 200) || '(empty body)'}`,
    );
  }
  const json = (await res.json().catch(() => null)) as
    | { data?: { token?: string } }
    | null;
  const apiKey = json?.data?.token;
  if (!apiKey || typeof apiKey !== 'string') {
    throw new CliError(
      'Gateway returned no API key in mint response',
      'auth-core may have changed its response shape — file an issue with the response body.',
    );
  }
  return { apiKey };
}

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, '');
}

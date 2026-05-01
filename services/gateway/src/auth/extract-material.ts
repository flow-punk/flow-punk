export interface AuthMaterial {
  rawCredential: string;
  credentialType: 'oauth' | 'apikey' | 'unknown';
}

export const OAUTH_TOKEN_PREFIX = 'mcp_';
export const API_KEY_PREFIX = 'fpk_';

/**
 * Parses the Authorization header and tags the credential by prefix.
 */
export function extractAuthMaterial(request: Request): AuthMaterial | null {
  const header = request.headers.get('Authorization');
  if (!header) return null;

  const rawCredential = header.startsWith('Bearer ')
    ? header.slice(7)
    : header;

  if (!rawCredential) return null;

  let credentialType: AuthMaterial['credentialType'] = 'unknown';
  if (rawCredential.startsWith(OAUTH_TOKEN_PREFIX)) credentialType = 'oauth';
  else if (rawCredential.startsWith(API_KEY_PREFIX)) credentialType = 'apikey';

  return { rawCredential, credentialType };
}

/**
 * Scoped-credential parser per ADR-013 §"Credential format".
 *
 * Every credential carries a routing prefix:
 *   - Sessions: `<scope>.<sessionId>` (cookie value, no Bearer prefix)
 *   - OAuth bearer: `mcp_<scope>.<random>`
 *   - OAuth client_id: `mcpc_<scope>.<random>`
 *   - API keys: `fpk_<scope>.<random>`
 *
 * `<scope>` is `platform` (PARENT_DB lookup), `_system` (indie single
 * tenant), or a tenant id (managed). The random/sessionId segment is
 * base64url, so the single `.` delimiter is unambiguous.
 *
 * Returns `null` when:
 *   - Input is empty.
 *   - The optional `prefix` is required but missing.
 *   - The remaining payload after the prefix has no `.` separator OR
 *     the scope segment is empty OR the random segment is empty.
 *
 * Tampering with the scope changes the credential's hash, so KV cache
 * keys (`sha256(rawCredential)`) cannot be poisoned by prefix swaps.
 */
export interface ScopedCredential {
  scope: string;
  payload: string;
}

export function parseScopedCredential(
  raw: string,
  prefix?: string,
): ScopedCredential | null {
  if (!raw) return null;
  let body = raw;
  if (prefix) {
    if (!raw.startsWith(prefix)) return null;
    body = raw.slice(prefix.length);
  }
  const dot = body.indexOf('.');
  if (dot < 1) return null;
  const scope = body.slice(0, dot);
  const payload = body.slice(dot + 1);
  if (!scope || !payload) return null;
  return { scope, payload };
}

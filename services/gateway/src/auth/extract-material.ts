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

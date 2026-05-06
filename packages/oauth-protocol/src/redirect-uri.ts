/**
 * Loopback hosts permitted by OAuth 2.1 §10.3.3 + RFC 8252 §7.3.
 * `localhost` is intentionally excluded — IETF guidance and our threat model both prefer
 * literal addresses, which cannot be intercepted by hosts file or DNS rebinding.
 */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['127.0.0.1', '[::1]']);

export interface RedirectUriPolicy {
  /** Maximum total length of a registered redirect URI string. */
  maxLength: number;
  /** Maximum number of registered redirect URIs per client. */
  maxPerClient: number;
}

export const DEFAULT_REDIRECT_URI_POLICY: RedirectUriPolicy = {
  maxLength: 2048,
  maxPerClient: 10,
};

export function isLoopbackRedirectUri(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:') return false;
  return LOOPBACK_HOSTS.has(url.hostname) || LOOPBACK_HOSTS.has(`[${url.hostname}]`);
}

/**
 * Validates a candidate redirect URI for registration (RFC 7591 §2):
 * - Must be a valid absolute URL.
 * - Must use `https:` OR be a loopback URI.
 * - Must not contain a fragment (RFC 6749 §3.1.2).
 */
export function isValidRegistrableRedirectUri(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.hash) return false;
  if (url.protocol === 'https:') return true;
  return isLoopbackRedirectUri(raw);
}

/**
 * Validates that a runtime redirect URI matches one of the registered URIs.
 * Per OAuth 2.1 §4.1.3, redirect URIs MUST match exactly EXCEPT loopback ports MAY vary
 * (RFC 8252 §7.3) — a registered `http://127.0.0.1/cb` matches inbound `http://127.0.0.1:54321/cb`.
 */
export function redirectUriMatches(
  inbound: string,
  registered: readonly string[],
): boolean {
  if (registered.includes(inbound)) return true;

  if (!isLoopbackRedirectUri(inbound)) return false;

  let inboundUrl: URL;
  try {
    inboundUrl = new URL(inbound);
  } catch {
    return false;
  }

  for (const reg of registered) {
    if (!isLoopbackRedirectUri(reg)) continue;
    let regUrl: URL;
    try {
      regUrl = new URL(reg);
    } catch {
      continue;
    }
    if (regUrl.hostname !== inboundUrl.hostname) continue;
    if (regUrl.pathname !== inboundUrl.pathname) continue;
    if (regUrl.search !== inboundUrl.search) continue;
    return true;
  }
  return false;
}

export function validateRedirectUriList(
  uris: readonly string[],
  policy: RedirectUriPolicy = DEFAULT_REDIRECT_URI_POLICY,
):
  | { ok: true }
  | { ok: false; error: 'too_many' | 'too_long' | 'invalid_redirect_uri'; offending?: string } {
  if (uris.length === 0) return { ok: false, error: 'invalid_redirect_uri' };
  if (uris.length > policy.maxPerClient) return { ok: false, error: 'too_many' };
  for (const uri of uris) {
    if (uri.length > policy.maxLength) return { ok: false, error: 'too_long', offending: uri };
    if (!isValidRegistrableRedirectUri(uri)) {
      return { ok: false, error: 'invalid_redirect_uri', offending: uri };
    }
  }
  return { ok: true };
}

export interface UnauthorizedOptions {
  /**
   * When true, emits RFC 6750 §3 `error="invalid_token"` in the
   * WWW-Authenticate header. Use when a token was presented and rejected
   * (expired, revoked, not found). Leave off when no credential was
   * presented at all.
   */
  invalidToken?: boolean;
  description?: string;
}

export function unauthorized(options?: UnauthorizedOptions): Response {
  const challenge = buildWwwAuthenticate(options);
  return new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
      'WWW-Authenticate': challenge,
    },
  });
}

function buildWwwAuthenticate(options?: UnauthorizedOptions): string {
  if (!options?.invalidToken) return 'Bearer';
  const description = options.description ?? 'The access token is invalid';
  return `Bearer error="invalid_token", error_description="${description}"`;
}

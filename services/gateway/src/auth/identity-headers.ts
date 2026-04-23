export interface IdentityHeaderValues {
  tenantId: string;
  userId: string;
  scope: string;
  credentialType: 'apikey' | 'oauth';
  credentialId?: string;
  clientId?: string;
}

export const IDENTITY_HEADER_NAMES = [
  'X-Tenant-Id',
  'X-User-Id',
  'X-Scope',
  'X-Credential-Type',
  'X-Credential-Id',
  'X-Client-Id',
] as const;

export function stripIdentityHeaders(src: Headers): Headers {
  const headers = new Headers(src);
  for (const name of IDENTITY_HEADER_NAMES) headers.delete(name);
  return headers;
}

export function stripIdentityHeadersFromRequest(request: Request): Request {
  return new Request(request, {
    headers: stripIdentityHeaders(request.headers),
  });
}

/**
 * Returns a new Headers object with inbound identity headers stripped and
 * validated identity headers injected.
 *
 * Strips on every path — including the apikey path where X-Client-Id is never
 * set — so a spoofed inbound X-Client-Id from an external client cannot
 * survive to downstream services. Downstream services trust these headers
 * because the gateway is the only external ingress.
 */
export function withIdentityHeaders(
  src: Headers,
  values: IdentityHeaderValues,
): Headers {
  const headers = stripIdentityHeaders(src);
  headers.set('X-Tenant-Id', values.tenantId);
  headers.set('X-User-Id', values.userId);
  headers.set('X-Scope', values.scope);
  headers.set('X-Credential-Type', values.credentialType);
  if (values.credentialId) headers.set('X-Credential-Id', values.credentialId);
  if (values.clientId) headers.set('X-Client-Id', values.clientId);
  return headers;
}

export function extractIdentityHeaders(
  src: Headers,
): IdentityHeaderValues | null {
  const tenantId = src.get('X-Tenant-Id');
  const userId = src.get('X-User-Id');
  const scope = src.get('X-Scope');
  const credentialType = src.get('X-Credential-Type');
  if (
    !tenantId ||
    !userId ||
    !scope ||
    (credentialType !== 'apikey' && credentialType !== 'oauth')
  ) {
    return null;
  }

  return {
    tenantId,
    userId,
    scope,
    credentialType,
    credentialId: src.get('X-Credential-Id') ?? undefined,
    clientId: src.get('X-Client-Id') ?? undefined,
  };
}

export function copyIdentityHeaders(
  src: Headers,
  dest: Headers = new Headers(),
): Headers {
  for (const name of IDENTITY_HEADER_NAMES) {
    const value = src.get(name);
    if (value) dest.set(name, value);
  }
  return dest;
}

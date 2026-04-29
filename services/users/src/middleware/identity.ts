import { extractIdentityHeaders } from '@flowpunk/gateway/auth';

import type { Actor } from '../types.js';

/**
 * Parse trusted identity headers off a request. Returns null when the
 * required set is missing or malformed — the gateway is the only ingress,
 * so a request reaching this worker without identity headers is either
 * misconfigured (a binding bypass) or unauthenticated.
 */
export function parseIdentity(request: Request): Actor | null {
  const values = extractIdentityHeaders(request.headers);
  if (!values) return null;
  return {
    userId: values.userId,
    tenantId: values.tenantId,
    scope: values.scope,
    credentialType: values.credentialType,
    credentialId: values.credentialId,
    clientId: values.clientId,
  };
}

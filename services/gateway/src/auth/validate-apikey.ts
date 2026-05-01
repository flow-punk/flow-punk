import { fetchWithServiceTimeout } from '../fetch-with-timeout.js';
import { API_KEY_PREFIX, parseScopedCredential } from './extract-material.js';
import { isValidApiKeyScope } from './scope.js';

export interface ValidatedIdentity {
  tenantId: string;
  userId: string;
  scope: string;
  credentialId?: string;
  keyLabel?: string | null;
}

/**
 * Validates an API key against AUTH_SERVICE.
 *
 * Per ADR-013 §"Credential format", `fpk_*` tokens carry the tenant
 * scope as a prefix: `fpk_<scope>.<random>`. The gateway parses the
 * scope here and forwards it in the validation body so AUTH_SERVICE
 * (a) can pick the right tenant D1 to look up the row, and (b) can
 * stamp the trusted X-Tenant-Id header back without any DB round-trip
 * for the tenant identity.
 *
 * Returns null on any failure (malformed prefix, network error, non-2xx,
 * or missing/invalid response fields).
 *
 * Takes the AUTH_SERVICE Fetcher directly rather than AppContext so both
 * the indie auth middleware and the managed auth middleware can reuse it.
 */
export async function validateApiKey(
  authService: Fetcher,
  rawCredential: string,
  serviceTimeoutMs: string,
): Promise<ValidatedIdentity | null> {
  const scoped = parseScopedCredential(rawCredential, API_KEY_PREFIX);
  if (!scoped) return null;

  try {
    const res = await fetchWithServiceTimeout(
      authService,
      'http://internal/auth/validate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credential: rawCredential,
          credentialType: 'apikey',
          tenantId: scoped.scope,
        }),
      },
      serviceTimeoutMs,
    );

    if (!res.ok) return null;

    const body = (await res.json()) as Partial<{
      tenantId: string;
      userId: string;
      scope: string;
      credentialId: string;
      keyLabel: string | null;
    }>;

    const scope = body.scope;
    if (
      !body.tenantId ||
      body.tenantId !== scoped.scope ||
      !body.userId ||
      typeof scope !== 'string' ||
      !isValidApiKeyScope(scope)
    ) {
      return null;
    }

    return {
      tenantId: body.tenantId,
      userId: body.userId,
      scope,
      credentialId:
        typeof body.credentialId === 'string' ? body.credentialId : undefined,
      keyLabel:
        body.keyLabel === null
          ? null
          : typeof body.keyLabel === 'string'
            ? body.keyLabel
            : undefined,
    };
  } catch {
    return null;
  }
}

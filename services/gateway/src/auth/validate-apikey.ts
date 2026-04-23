import { fetchWithServiceTimeout } from '../fetch-with-timeout.js';
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
 * Returns identity on success, null on any failure (network error, non-2xx,
 * or missing required fields).
 *
 * Takes the AUTH_SERVICE Fetcher directly rather than AppContext so both the
 * indie auth middleware and the managed auth middleware can reuse it.
 */
export async function validateApiKey(
  authService: Fetcher,
  rawCredential: string,
  serviceTimeoutMs: string,
): Promise<ValidatedIdentity | null> {
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

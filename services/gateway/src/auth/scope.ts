export type RequiredScope = 'read' | 'write';

/**
 * Credential types accepted on the MCP transport. `'session'` is deliberately
 * excluded — sessions are admin-REST-only and never valid for MCP. Mirrored
 * by `McpCredentialType` in `identity-headers.ts`.
 */
export type CredentialScopeType = 'apikey' | 'oauth';

const API_KEY_SCOPE_TOKENS = new Set<RequiredScope>(['read', 'write']);
const MCP_TRANSPORT_SCOPE = 'mcp';

/**
 * Reserved scope token for the admin REST surface. Stamped only on
 * `credentialType: 'session'` requests (see managed gateway's
 * `validate-session.ts`). API-key credentials must NOT carry `'admin'` —
 * `isValidApiKeyScope` rejects it explicitly.
 */
const ADMIN_SCOPE_TOKEN = 'admin';

export function requiredScopeFor(method: string): RequiredScope {
  const m = method.toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return 'read';
  return 'write';
}

export function hasScope(
  scope: string | undefined,
  required: RequiredScope,
): boolean {
  return parseScopeTokens(scope).includes(required);
}

export function hasMcpAccess(scope: string | undefined): boolean {
  return parseScopeTokens(scope).includes(MCP_TRANSPORT_SCOPE);
}

export function isValidApiKeyScope(scope: string | undefined): boolean {
  const tokens = parseScopeTokens(scope);
  // `'admin'` is reserved for sessions; an API-key request stamping
  // `scope: 'admin'` is malformed by construction.
  if (tokens.includes(ADMIN_SCOPE_TOKEN)) return false;
  return tokens.length > 0 && tokens.every((token) => API_KEY_SCOPE_TOKENS.has(token as RequiredScope));
}

export function hasToolExecutionScope(
  credentialType: CredentialScopeType | undefined,
  scope: string | undefined,
  required: RequiredScope,
): boolean {
  if (credentialType === 'oauth') return hasMcpAccess(scope);
  return hasScope(scope, required);
}

export function enforceRestScope(
  method: string,
  scope: string | undefined,
): Response | null {
  const tokens = parseScopeTokens(scope);
  // `'admin'` is the session-only scope token; admin-stamped requests
  // satisfy both read and write requirements on the admin REST surface.
  if (tokens.includes(ADMIN_SCOPE_TOKEN)) return null;

  const required = requiredScopeFor(method);
  if (tokens.includes(required)) return null;

  return new Response(
    JSON.stringify({
      error: 'insufficient_scope',
      error_description: `this endpoint requires the "${required}" scope`,
      required_scope: required,
    }),
    {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': `Bearer error="insufficient_scope", scope="${required}"`,
        'Cache-Control': 'no-store',
      },
    },
  );
}

function parseScopeTokens(scope: string | undefined): string[] {
  if (!scope) return [];
  return scope.split(/\s+/).map((token) => token.trim()).filter((token) => token !== '');
}

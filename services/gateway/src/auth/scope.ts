export type RequiredScope = 'read' | 'write';
export type CredentialScopeType = 'apikey' | 'oauth';

const API_KEY_SCOPE_TOKENS = new Set<RequiredScope>(['read', 'write']);
const MCP_TRANSPORT_SCOPE = 'mcp';

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
  const required = requiredScopeFor(method);
  if (hasScope(scope, required)) return null;

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

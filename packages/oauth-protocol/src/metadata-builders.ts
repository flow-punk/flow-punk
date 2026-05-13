/**
 * Pure builders for RFC 9728 Protected Resource Metadata and RFC 8414 Authorization Server Metadata.
 * These functions are issuer-URL-parameterized; no env reads, no request awareness.
 */

export interface ProtectedResourceMetadataInput {
  /** The protected resource URL (e.g. https://example.com or https://example.com/mcp). */
  resource: string;
  /** Authorization server issuer URLs that issue tokens for this resource. */
  authorizationServers: readonly string[];
  /** Scopes the resource recognizes — per MCP guidance, advertise least-privilege baseline. */
  scopesSupported: readonly string[];
  /** Optional display name for the resource. */
  resourceName?: string;
}

export interface AuthorizationServerMetadataInput {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint?: string;
  revocationEndpoint?: string;
  scopesSupported: readonly string[];
  responseTypesSupported?: readonly string[];
  grantTypesSupported?: readonly string[];
  codeChallengeMethodsSupported?: readonly string[];
  tokenEndpointAuthMethodsSupported?: readonly string[];
  /** RFC 9728 — set true when the AS validates `resource` parameter per RFC 8707. */
  resourceParameterSupported?: boolean;
}

export function buildProtectedResourceMetadata(
  input: ProtectedResourceMetadataInput,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    resource: input.resource,
    authorization_servers: [...input.authorizationServers],
    scopes_supported: [...input.scopesSupported],
    bearer_methods_supported: ["header"],
  };
  if (input.resourceName) out.resource_name = input.resourceName;
  return out;
}

export function buildAuthorizationServerMetadata(
  input: AuthorizationServerMetadataInput,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    issuer: input.issuer,
    authorization_endpoint: input.authorizationEndpoint,
    token_endpoint: input.tokenEndpoint,
    response_types_supported: [...(input.responseTypesSupported ?? ["code"])],
    grant_types_supported: [
      ...(input.grantTypesSupported ?? ["authorization_code", "refresh_token"]),
    ],
    code_challenge_methods_supported: [
      ...(input.codeChallengeMethodsSupported ?? ["S256"]),
    ],
    token_endpoint_auth_methods_supported: [
      ...(input.tokenEndpointAuthMethodsSupported ?? ["none"]),
    ],
    scopes_supported: [...input.scopesSupported],
  };
  if (input.registrationEndpoint)
    out.registration_endpoint = input.registrationEndpoint;
  if (input.revocationEndpoint) {
    out.revocation_endpoint = input.revocationEndpoint;
    out.revocation_endpoint_auth_methods_supported = ["none"];
  }
  if (input.resourceParameterSupported !== undefined) {
    out.resource_parameter_supported = input.resourceParameterSupported;
  }
  return out;
}

import {
  buildAuthorizationServerMetadata,
  buildProtectedResourceMetadata,
} from "@flowpunk-indie/oauth-protocol";

import type { OAuthEnv } from "../env.js";
import { AS_SCOPES_SUPPORTED, PRM_SCOPES_SUPPORTED } from "../policy.js";
import {
  getAllowedResources,
  getIssuerOrigin,
  getProtectedResource,
} from "../origin.js";

export function handleProtectedResourceMetadata(
  request: Request,
  env: OAuthEnv,
): Response {
  const issuer = getIssuerOrigin(env, request);
  const resource = getProtectedResource(env, request);
  const body = buildProtectedResourceMetadata({
    resource,
    authorizationServers: [issuer],
    scopesSupported: PRM_SCOPES_SUPPORTED,
  });
  return Response.json(body);
}

export function handleAuthorizationServerMetadata(
  request: Request,
  env: OAuthEnv,
): Response {
  const issuer = getIssuerOrigin(env, request);
  const body = buildAuthorizationServerMetadata({
    issuer,
    authorizationEndpoint: `${issuer}/oauth/authorize`,
    tokenEndpoint: `${issuer}/oauth/token`,
    registrationEndpoint: `${issuer}/oauth/register`,
    revocationEndpoint: `${issuer}/oauth/revoke`,
    scopesSupported: AS_SCOPES_SUPPORTED,
    resourceParameterSupported: true,
  });
  // Also include a `resource` field listing the allowed audiences (extension
  // surfaced for tooling that uses it for auto-config).
  const out = { ...body, resource: getAllowedResources(env, request) };
  return Response.json(out);
}

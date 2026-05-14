import { randomBase64Url } from "@flowpunk-indie/oauth-protocol";
import { INDIE_SCOPE } from "./env.js";

const OAUTH_TOKEN_PREFIX = "mcp_";
const OAUTH_CLIENT_PREFIX = "mcpc_";

export function mintIndieAccessToken(): string {
  return `${OAUTH_TOKEN_PREFIX}${INDIE_SCOPE}.${randomBase64Url(32)}`;
}

export function mintIndieRefreshToken(): string {
  return `${OAUTH_TOKEN_PREFIX}${INDIE_SCOPE}.${randomBase64Url(32)}`;
}

export function mintIndieClientId(): string {
  return `${OAUTH_CLIENT_PREFIX}${INDIE_SCOPE}.${randomBase64Url(24)}`;
}

/**
 * Returns true iff `raw` is a syntactically valid indie OAuth bearer
 * token. Used by the gateway middleware to reject `mcp_<other>.<...>`
 * (managed-shaped) tokens before any DB read.
 */
export function isIndieToken(raw: string): boolean {
  if (!raw.startsWith(OAUTH_TOKEN_PREFIX)) return false;
  const body = raw.slice(OAUTH_TOKEN_PREFIX.length);
  const dot = body.indexOf(".");
  if (dot < 1) return false;
  const scope = body.slice(0, dot);
  const payload = body.slice(dot + 1);
  return scope === INDIE_SCOPE && payload.length > 0;
}

export function isIndieClientId(raw: string): boolean {
  if (!raw.startsWith(OAUTH_CLIENT_PREFIX)) return false;
  const body = raw.slice(OAUTH_CLIENT_PREFIX.length);
  const dot = body.indexOf(".");
  if (dot < 1) return false;
  const scope = body.slice(0, dot);
  const payload = body.slice(dot + 1);
  return scope === INDIE_SCOPE && payload.length > 0;
}

export { OAUTH_TOKEN_PREFIX, OAUTH_CLIENT_PREFIX };

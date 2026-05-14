import assert from "node:assert/strict";
import test from "node:test";

import {
  getAllowedResources,
  getIssuerOrigin,
  getProtectedResource,
  getSingleResource,
} from "./origin.js";
import type { OAuthEnv } from "./env.js";

const ORIGIN = "https://flowpunk-gateway.mark-29f.workers.dev";

function envWith(overrides: Partial<OAuthEnv> = {}): OAuthEnv {
  return {
    GATEWAY_PUBLIC_ORIGIN: ORIGIN,
    OAUTH_RESOURCE_ALLOWLIST: undefined,
    ...overrides,
  } as OAuthEnv;
}

const dummyRequest = new Request(`${ORIGIN}/oauth/authorize`);

test("getIssuerOrigin returns the configured GATEWAY_PUBLIC_ORIGIN unchanged", () => {
  assert.equal(getIssuerOrigin(envWith(), dummyRequest), ORIGIN);
});

test("getProtectedResource returns <origin>/mcp (canonical MCP endpoint URL)", () => {
  // Per ADR-019 amendment 2026-05-06b — bare origin caused
  // McpEndpointNotFound from Claude.ai because they used the advertised
  // resource as the URL to POST MCP traffic to. PRM and the audience
  // semantics now point at the actual `/mcp` endpoint.
  assert.equal(getProtectedResource(envWith(), dummyRequest), `${ORIGIN}/mcp`);
});

test("getAllowedResources defaults to [origin, origin/mcp]", () => {
  const got = getAllowedResources(envWith(), dummyRequest);
  assert.deepEqual(got, [ORIGIN, `${ORIGIN}/mcp`]);
});

test("getAllowedResources honors OAUTH_RESOURCE_ALLOWLIST when set", () => {
  const got = getAllowedResources(
    envWith({
      OAUTH_RESOURCE_ALLOWLIST: "https://a.example,https://b.example",
    }),
    dummyRequest,
  );
  assert.deepEqual(got, ["https://a.example", "https://b.example"]);
});

test("getAllowedResources strips trailing slashes from configured list", () => {
  const got = getAllowedResources(
    envWith({
      OAUTH_RESOURCE_ALLOWLIST: "https://a.example/,https://b.example",
    }),
    dummyRequest,
  );
  assert.deepEqual(got, ["https://a.example", "https://b.example"]);
});

test("getSingleResource accepts the bare origin", () => {
  const result = getSingleResource([ORIGIN], [ORIGIN, `${ORIGIN}/mcp`]);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.resource, ORIGIN);
});

test("getSingleResource accepts the MCP endpoint URL", () => {
  const result = getSingleResource(
    [`${ORIGIN}/mcp`],
    [ORIGIN, `${ORIGIN}/mcp`],
  );
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.resource, `${ORIGIN}/mcp`);
});

test("getSingleResource normalizes trailing slash on incoming value", () => {
  // Claude.ai canonicalizes bare origins by appending `/`. We must accept
  // both `<origin>` and `<origin>/`.
  const result = getSingleResource([`${ORIGIN}/`], [ORIGIN, `${ORIGIN}/mcp`]);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.resource, ORIGIN);
});

test("getSingleResource normalizes trailing slash on allowlist entry", () => {
  const result = getSingleResource([ORIGIN], [`${ORIGIN}/`]);
  assert.equal(result.ok, true);
});

test("getSingleResource rejects unknown resource with invalid_target", () => {
  const result = getSingleResource(
    ["https://attacker.example"],
    [ORIGIN, `${ORIGIN}/mcp`],
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "invalid_target");
});

test("getSingleResource rejects empty resource value with invalid_target", () => {
  const result = getSingleResource([""], [ORIGIN]);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "invalid_target");
});

test("getSingleResource rejects multiple resource values per RFC 8707", () => {
  // RFC 8707 §2 says clients SHOULD include exactly one resource per
  // request when the AS supports a single audience per access token.
  // Indie does, so we reject multi-valued explicitly.
  const result = getSingleResource(
    [ORIGIN, `${ORIGIN}/mcp`],
    [ORIGIN, `${ORIGIN}/mcp`],
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "invalid_target");
});

test("getSingleResource rejects when no resource value supplied", () => {
  const result = getSingleResource([], [ORIGIN]);
  assert.equal(result.ok, false);
});

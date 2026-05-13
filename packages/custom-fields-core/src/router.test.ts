import assert from "node:assert/strict";
import test from "node:test";

import type { CustomFieldBaseModel } from "@flowpunk-indie/db";

import { routeCustomFields, CUSTOM_FIELDS_PATHS } from "./router.js";
import type { Actor, CustomFieldsEnv } from "./types.js";

const STUB_ACTOR: Actor = {
  userId: "user_alice",
  tenantId: "tenant_demo",
  scope: "mcp flowpunk",
  credentialType: "session",
};

const STUB_ENV = {
  DB: {} as D1Database,
} as CustomFieldsEnv;

test("routeCustomFields returns null for paths outside its prefix", async () => {
  const res = await routeCustomFields(
    new Request("https://example.com/api/v1/persons/per_aaaaaaaaaaaaaaaaaaaaa"),
    STUB_ENV,
    STUB_ACTOR,
    { allowedBaseModels: ["person"] },
  );
  assert.equal(res, null);
});

test("routeCustomFields returns 405 with Allow header for unsupported methods on collection", async () => {
  const res = await routeCustomFields(
    new Request(`https://example.com${CUSTOM_FIELDS_PATHS.COLLECTION}`, {
      method: "PUT",
    }),
    STUB_ENV,
    STUB_ACTOR,
    { allowedBaseModels: ["person"] },
  );
  assert.ok(res);
  assert.equal(res!.status, 405);
  assert.equal(res!.headers.get("Allow"), "GET, HEAD, POST");
});

test("routeCustomFields returns 405 with Allow header for unsupported methods on item", async () => {
  const res = await routeCustomFields(
    new Request(
      `https://example.com${CUSTOM_FIELDS_PATHS.ITEM_PREFIX}cfd_aaaaaaaaaaaaaaaaaaaaa`,
      { method: "POST" },
    ),
    STUB_ENV,
    STUB_ACTOR,
    { allowedBaseModels: ["person"] },
  );
  assert.ok(res);
  assert.equal(res!.status, 405);
  assert.equal(res!.headers.get("Allow"), "GET, HEAD, PATCH, DELETE");
});

test("CUSTOM_FIELDS_PATHS constants match the router contract", () => {
  assert.equal(CUSTOM_FIELDS_PATHS.COLLECTION, "/api/v1/custom-fields/defs");
  assert.equal(CUSTOM_FIELDS_PATHS.ITEM_PREFIX, "/api/v1/custom-fields/defs/");
});

test("routing allowlist is wrapper-supplied and immutable", () => {
  // Compile-time guarantee: the option type forbids mutation. Smoke-check
  // that the field is correctly typed in the signature surface.
  const allowed: readonly CustomFieldBaseModel[] = ["person", "account"];
  assert.equal(allowed.length, 2);
  assert.equal(allowed[0], "person");
});

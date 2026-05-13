import assert from "node:assert/strict";
import test from "node:test";

import { customFieldsSpec } from "./index.js";

test("exposes the /api/v1/custom-fields/defs collection and item paths", () => {
  const paths = Object.keys(customFieldsSpec.paths);
  assert.ok(paths.includes("/api/v1/custom-fields/defs"));
  assert.ok(paths.includes("/api/v1/custom-fields/defs/{id}"));
});

test("exposes the CustomFieldDef and create/patch schemas", () => {
  const names = Object.keys(customFieldsSpec.components.schemas);
  assert.ok(names.includes("CustomFieldDef"));
  assert.ok(names.includes("CustomFieldDefCreate"));
  assert.ok(names.includes("CustomFieldDefPatch"));
});

test("CustomFieldDefPatch only allows description and pii", () => {
  const schema = (customFieldsSpec.components.schemas as Record<string, any>)
    .CustomFieldDefPatch as { properties: Record<string, unknown> };
  const props = Object.keys(schema.properties);
  assert.deepEqual(props.sort(), ["description", "pii"]);
});

test("list operation requires the baseModel query param", () => {
  const op = (customFieldsSpec.paths as Record<string, any>)[
    "/api/v1/custom-fields/defs"
  ].get;
  const baseModel = op.parameters.find(
    (p: { name: string }) => p.name === "baseModel",
  );
  assert.ok(baseModel);
  assert.equal(baseModel.required, true);
  assert.deepEqual(baseModel.schema.enum, ["person", "account", "deal"]);
});

test("PATCH and DELETE require the If-Match header", () => {
  const item = (customFieldsSpec.paths as Record<string, any>)[
    "/api/v1/custom-fields/defs/{id}"
  ];
  const patchHeader = item.patch.parameters.find(
    (p: { name: string }) => p.name === "If-Match",
  );
  assert.ok(patchHeader);
  assert.equal(patchHeader.required, true);
  const deleteHeader = item.delete.parameters.find(
    (p: { name: string }) => p.name === "If-Match",
  );
  assert.ok(deleteHeader);
  assert.equal(deleteHeader.required, true);
});

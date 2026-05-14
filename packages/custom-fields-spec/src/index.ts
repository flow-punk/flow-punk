/**
 * OpenAPI fragment for the custom-fields registry CRUD surface.
 *
 * Mounted in both indie/services/contacts and indie/services/pipeline
 * routers (per ADR-023 §12) — the paths are identical, but each service
 * enforces its own `baseModel` allowlist (`person`+`account` for
 * contacts, `deal` for pipeline). From the spec's perspective the surface
 * is one logical resource at `/api/v1/custom-fields/defs`.
 *
 * Schemas are hand-written rather than derived from the Drizzle table.
 * Reason: the Drizzle table stores `pii` as INTEGER 0/1 and exposes
 * server-managed fields (`filterable_status`, `filterable_error`,
 * `version`, `archived_at`) that must not appear in Create bodies. The
 * HTTP API speaks `pii: boolean` — see `serializeDef` in
 * `@flowpunk-indie/custom-fields-core`'s `_shared.ts` for the coercion
 * point. Keeping the spec aligned with the wire shape is the trade-off
 * for not deriving from the column metadata.
 */

import {
  CUSTOM_FIELD_BASE_MODELS,
  CUSTOM_FIELD_FILTERABLE_STATUSES,
} from "@flowpunk-indie/db/schema/custom-field-defs";

const CustomFieldDef = {
  type: "object",
  required: [
    "id",
    "baseModel",
    "name",
    "description",
    "pii",
    "filterableStatus",
    "filterableError",
    "version",
    "createdAt",
    "updatedAt",
    "createdBy",
    "updatedBy",
    "archivedAt",
  ],
  properties: {
    id: {
      type: "string",
      description: "`cfd_<21>` id.",
    },
    baseModel: {
      type: "string",
      enum: [...CUSTOM_FIELD_BASE_MODELS],
    },
    name: {
      type: "string",
      description: "Slug — matches `^[a-z][a-z0-9_]{0,30}$`.",
    },
    description: { type: ["string", "null"] },
    pii: {
      type: "boolean",
      description:
        "Default-PII flag per ADR-023 §3. Defaults to true at create time.",
    },
    filterableStatus: {
      type: "string",
      enum: [...CUSTOM_FIELD_FILTERABLE_STATUSES],
    },
    filterableError: { type: ["string", "null"] },
    version: {
      type: "integer",
      description:
        "Optimistic-concurrency counter. Bumped on every UPDATE. PATCH/DELETE require `If-Match: <version>`.",
    },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
    createdBy: { type: "string" },
    updatedBy: { type: "string" },
    archivedAt: { type: ["string", "null"] },
  },
} as const;

const CustomFieldDefCreate = {
  type: "object",
  required: ["baseModel", "name"],
  properties: {
    baseModel: {
      type: "string",
      enum: [...CUSTOM_FIELD_BASE_MODELS],
      description:
        "Which built-in entity this field attaches to. Must match the calling service`s allowlist (`person`+`account` for contacts; `deal` for pipeline).",
    },
    name: {
      type: "string",
      description: "Slug — `^[a-z][a-z0-9_]{0,30}$`.",
    },
    description: {
      type: ["string", "null"],
      description: "Optional human-readable label.",
    },
    pii: {
      type: "boolean",
      description:
        "Default-PII flag (ADR-023 §3). Defaults to `true` when omitted.",
    },
  },
  additionalProperties: false,
} as const;

const CustomFieldDefPatch = {
  type: "object",
  properties: {
    description: { type: ["string", "null"] },
    pii: { type: "boolean" },
  },
  additionalProperties: false,
  description:
    "PATCH only allows `description` and `pii`. `name` is immutable; lifecycle transitions (`filterable`) ship via a dedicated endpoint in PR-β.",
} as const;

const cfdSchemas = {
  CustomFieldDef,
  CustomFieldDefCreate,
  CustomFieldDefPatch,
};

const ERROR_REF = { $ref: "#/components/schemas/ErrorResponse" } as const;

const stdErrors = {
  "400": {
    description: "Invalid input",
    content: { "application/json": { schema: ERROR_REF } },
  },
  "401": {
    description: "Unauthenticated",
    content: { "application/json": { schema: ERROR_REF } },
  },
  "404": {
    description: "Not found",
    content: { "application/json": { schema: ERROR_REF } },
  },
  "409": {
    description:
      "Conflict — VERSION_CONFLICT (If-Match), DUPLICATE_NAME, LIMIT_EXCEEDED, or WRONG_STATE",
    content: { "application/json": { schema: ERROR_REF } },
  },
  "428": {
    description: "PRECONDITION_REQUIRED — If-Match header is required",
    content: { "application/json": { schema: ERROR_REF } },
  },
} as const;

function itemResponse(description: string, itemRef: string) {
  return {
    description,
    content: {
      "application/json": {
        schema: {
          type: "object",
          required: ["def"],
          properties: { def: { $ref: itemRef } },
        },
      },
    },
  } as const;
}

function listResponse(itemRef: string) {
  return {
    description: "List of custom field definitions",
    content: {
      "application/json": {
        schema: {
          type: "object",
          required: ["defs"],
          properties: {
            defs: { type: "array", items: { $ref: itemRef } },
          },
        },
      },
    },
  } as const;
}

function jsonBody(ref: string) {
  return {
    required: true,
    content: { "application/json": { schema: { $ref: ref } } },
  } as const;
}

const BASE_MODEL_PARAM = {
  name: "baseModel",
  in: "query",
  required: true,
  description: "Which built-in entity these defs attach to.",
  schema: { type: "string", enum: [...CUSTOM_FIELD_BASE_MODELS] },
} as const;

const INCLUDE_ARCHIVED_PARAM = {
  name: "includeArchived",
  in: "query",
  required: false,
  description:
    "Set to `1` to include archived (tombstoned) defs. Default omits them.",
  schema: { type: "string", enum: ["1"] },
} as const;

const IF_MATCH_HEADER = {
  name: "If-Match",
  in: "header",
  required: true,
  description:
    "Optimistic-concurrency token: the expected `version` value from the def. Mismatch returns 409 VERSION_CONFLICT.",
  schema: { type: "string" },
} as const;

export const customFieldsSpec = {
  tags: [
    {
      name: "Custom Fields",
      description:
        "Tenant-defined custom fields on built-in entities (persons / accounts / deals). See ADR-023.",
    },
  ],
  components: {
    schemas: {
      ...cfdSchemas,
    },
  },
  paths: {
    "/api/v1/custom-fields/defs": {
      get: {
        operationId: "listCustomFieldDefs",
        summary: "List custom field definitions",
        description:
          "Returns all defs for the given base model. Active-only by default; pass `includeArchived=1` to include tombstoned rows.",
        tags: ["Custom Fields"],
        parameters: [BASE_MODEL_PARAM, INCLUDE_ARCHIVED_PARAM],
        responses: {
          "200": listResponse("#/components/schemas/CustomFieldDef"),
          "400": stdErrors["400"],
          "401": stdErrors["401"],
        },
      },
      post: {
        operationId: "createCustomFieldDef",
        summary: "Create a custom field definition",
        description:
          'Creates an active def at `filterable_status: "disabled"`. Slug `name` must match `^[a-z][a-z0-9_]{0,30}$`. Caps per ADR-023 §9.',
        tags: ["Custom Fields"],
        requestBody: jsonBody("#/components/schemas/CustomFieldDefCreate"),
        responses: {
          "201": itemResponse(
            "Custom field def created",
            "#/components/schemas/CustomFieldDef",
          ),
          "400": stdErrors["400"],
          "401": stdErrors["401"],
          "409": stdErrors["409"],
        },
      },
    },
    "/api/v1/custom-fields/defs/{id}": {
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          description: "Def id (`cfd_<21>`).",
          schema: { type: "string" },
        },
      ],
      get: {
        operationId: "getCustomFieldDef",
        summary: "Get a custom field definition",
        tags: ["Custom Fields"],
        responses: {
          "200": itemResponse(
            "The requested custom field def",
            "#/components/schemas/CustomFieldDef",
          ),
          "401": stdErrors["401"],
          "404": stdErrors["404"],
        },
      },
      patch: {
        operationId: "updateCustomFieldDef",
        summary: "Update a custom field definition",
        description:
          "Patches `description` and/or `pii`. Requires `If-Match: <version>` per ADR-023 §7. `name` is immutable; filterable transitions ship via a dedicated endpoint (PR-β).",
        tags: ["Custom Fields"],
        parameters: [IF_MATCH_HEADER],
        requestBody: jsonBody("#/components/schemas/CustomFieldDefPatch"),
        responses: {
          "200": itemResponse(
            "Custom field def updated",
            "#/components/schemas/CustomFieldDef",
          ),
          "400": stdErrors["400"],
          "401": stdErrors["401"],
          "404": stdErrors["404"],
          "409": stdErrors["409"],
          "428": stdErrors["428"],
        },
      },
      delete: {
        operationId: "archiveCustomFieldDef",
        summary: "Archive a custom field definition",
        description:
          "Tombstones the def. Existing `custom_data` values on entity rows become inert. The slug becomes reusable. Requires `If-Match: <version>`.",
        tags: ["Custom Fields"],
        parameters: [IF_MATCH_HEADER],
        responses: {
          "200": itemResponse(
            "Custom field def archived",
            "#/components/schemas/CustomFieldDef",
          ),
          "401": stdErrors["401"],
          "404": stdErrors["404"],
          "409": stdErrors["409"],
          "428": stdErrors["428"],
        },
      },
    },
  },
} as const;

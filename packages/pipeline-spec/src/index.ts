/**
 * OpenAPI fragment for pipeline-core REST routes (pipelines + stages + deals).
 *
 * Entity / Create / Patch schemas are derived from the Drizzle tables.
 * Source of truth: `indie/packages/db/src/schema/{pipelines,stages,deals}.ts`.
 */

import { tableToSchemas } from '@flowpunk-indie/openapi-from-drizzle';
import {
  ALLOWED_PATCH_FIELDS as PIPELINE_PATCH,
  NULLABLE_PATCH_FIELDS as PIPELINE_NULLABLE,
  pipelines,
} from '@flowpunk-indie/db/schema/pipelines';
import {
  ALLOWED_PATCH_FIELDS as STAGE_PATCH,
  NULLABLE_PATCH_FIELDS as STAGE_NULLABLE,
  TERMINAL_KIND_VALUES,
  stages,
} from '@flowpunk-indie/db/schema/stages';
import {
  ALLOWED_PATCH_FIELDS as DEAL_PATCH,
  NULLABLE_PATCH_FIELDS as DEAL_NULLABLE,
  deals,
} from '@flowpunk-indie/db/schema/deals';

const PIPELINE_STATUSES = ['active', 'deleted'] as const;
const STAGE_STATUSES = ['active', 'deleted'] as const;
const DEAL_STATUSES = ['active', 'deleted'] as const;

const pipelineSchemas = tableToSchemas(pipelines, {
  name: 'Pipeline',
  enums: { status: PIPELINE_STATUSES },
  patch: { allowed: PIPELINE_PATCH, nullable: PIPELINE_NULLABLE },
});
const stageSchemas = tableToSchemas(stages, {
  name: 'Stage',
  enums: { status: STAGE_STATUSES, terminalKind: TERMINAL_KIND_VALUES },
  patch: { allowed: STAGE_PATCH, nullable: STAGE_NULLABLE },
});
const dealSchemas = tableToSchemas(deals, {
  name: 'Deal',
  enums: { status: DEAL_STATUSES },
  patch: { allowed: DEAL_PATCH, nullable: DEAL_NULLABLE },
});

const ERROR_REF = { $ref: '#/components/schemas/ErrorResponse' } as const;

const stdErrors = {
  '400': { description: 'Invalid input', content: { 'application/json': { schema: ERROR_REF } } },
  '401': { description: 'Unauthenticated', content: { 'application/json': { schema: ERROR_REF } } },
  '404': { description: 'Not found', content: { 'application/json': { schema: ERROR_REF } } },
  '409': { description: 'Conflict (e.g., child rows still active, or optimistic-concurrency miss on deal writes per ADR-022)', content: { 'application/json': { schema: ERROR_REF } } },
} as const;

// `deal_history` is a hand-built schema rather than Drizzle-derived: the
// `changes` JSON shape varies by `kind` (per ADR-022 §4), which doesn't
// round-trip through `tableToSchemas`. PII: `changes` is `pii()`-marked
// in the schema and treated as opaque text in OpenAPI — clients are PII-
// aware.
const dealHistorySchemas = {
  DealHistory: {
    type: 'object',
    required: [
      'id',
      'dealId',
      'kind',
      'changes',
      'actorId',
      'credentialType',
      'createdAt',
    ],
    properties: {
      id: { type: 'string', pattern: '^dhx_[a-z0-9]{21}$' },
      dealId: { type: 'string', pattern: '^deal_[a-z0-9]{21}$' },
      kind: {
        type: 'string',
        enum: [
          'created',
          'updated',
          'stage_moved',
          'soft_deleted',
          'contact_added',
          'contact_removed',
        ],
        description:
          "Append-only kind discriminator. v1 emits `created | updated | stage_moved | soft_deleted`; `contact_added | contact_removed` are reserved in the schema CHECK constraint but not emitted until deal_contacts ships.",
      },
      changes: {
        type: ['string', 'null'],
        description:
          'JSON-stringified change payload (shape varies by kind — see ADR-022 §4). `null` for kind="soft_deleted".',
      },
      actorId: { type: 'string' },
      credentialType: {
        type: 'string',
        enum: ['apikey', 'oauth', 'session', 'system'],
      },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
} as const;

function listResponse(itemRef: string) {
  return {
    description: 'List of items',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: { type: 'array', items: { $ref: itemRef } },
          },
        },
      },
    },
  } as const;
}

function itemResponse(description: string, itemRef: string) {
  return {
    description,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: { $ref: itemRef },
          },
        },
      },
    },
  } as const;
}

function jsonBody(ref: string) {
  return {
    required: true,
    content: { 'application/json': { schema: { $ref: ref } } },
  } as const;
}

function crudPaths(opts: {
  collection: string;
  itemPattern: string;
  tag: string;
  entityRef: string;
  createRef: string;
  patchRef: string;
  ids: { list: string; create: string; get: string; update: string; del: string };
  noun: string; // e.g., "pipeline" / "stage"
}) {
  const itemPath = opts.itemPattern;
  return {
    [opts.collection]: {
      get: {
        operationId: opts.ids.list,
        summary: `List ${opts.tag.toLowerCase()}`,
        tags: [opts.tag],
        responses: { '200': listResponse(opts.entityRef), '401': stdErrors['401'] },
      },
      post: {
        operationId: opts.ids.create,
        summary: `Create a ${opts.noun}`,
        tags: [opts.tag],
        requestBody: jsonBody(opts.createRef),
        responses: {
          '201': itemResponse(`${opts.noun.charAt(0).toUpperCase()}${opts.noun.slice(1)} created`, opts.entityRef),
          '400': stdErrors['400'],
          '401': stdErrors['401'],
          '409': stdErrors['409'],
        },
      },
    },
    [itemPath]: {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      get: {
        operationId: opts.ids.get,
        summary: `Get a ${opts.noun} by ID`,
        tags: [opts.tag],
        responses: {
          '200': itemResponse(`The requested ${opts.noun}`, opts.entityRef),
          '401': stdErrors['401'],
          '404': stdErrors['404'],
        },
      },
      patch: {
        operationId: opts.ids.update,
        summary: `Update a ${opts.noun}`,
        tags: [opts.tag],
        requestBody: jsonBody(opts.patchRef),
        responses: {
          '200': itemResponse(`${opts.noun.charAt(0).toUpperCase()}${opts.noun.slice(1)} updated`, opts.entityRef),
          '400': stdErrors['400'],
          '401': stdErrors['401'],
          '404': stdErrors['404'],
          '409': stdErrors['409'],
        },
      },
      delete: {
        operationId: opts.ids.del,
        summary: `Soft-delete a ${opts.noun}`,
        tags: [opts.tag],
        responses: {
          '200': itemResponse(`${opts.noun.charAt(0).toUpperCase()}${opts.noun.slice(1)} soft-deleted`, opts.entityRef),
          '401': stdErrors['401'],
          '404': stdErrors['404'],
          '409': stdErrors['409'],
        },
      },
    },
  };
}

const DEAL_HISTORY_LIST_RESPONSE = {
  description: 'Cursor-paginated list of deal-history rows.',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: ['items', 'nextCursor'],
        properties: {
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/DealHistory' },
          },
          nextCursor: { type: ['string', 'null'] },
        },
      },
    },
  },
} as const;

const DEAL_HISTORY_ITEM_RESPONSE = {
  description: 'A single deal-history row.',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: ['deal_history'],
        properties: {
          deal_history: { $ref: '#/components/schemas/DealHistory' },
        },
      },
    },
  },
} as const;

export const pipelineSpec = {
  tags: [
    { name: 'Pipelines', description: 'Sales pipelines.' },
    { name: 'Stages', description: 'Stages within a pipeline.' },
    { name: 'Deals', description: 'Deals (opportunities) flowing through stages.' },
    {
      name: 'DealHistory',
      description:
        'Append-only per-tenant timeline of deal mutations (ADR-022). Read-only surface.',
    },
  ],
  components: {
    schemas: {
      ...pipelineSchemas,
      ...stageSchemas,
      ...dealSchemas,
      ...dealHistorySchemas,
    },
  },
  paths: {
    ...crudPaths({
      collection: '/api/v1/pipelines',
      itemPattern: '/api/v1/pipelines/{id}',
      tag: 'Pipelines',
      entityRef: '#/components/schemas/Pipeline',
      createRef: '#/components/schemas/PipelineCreate',
      patchRef: '#/components/schemas/PipelinePatch',
      ids: {
        list: 'listPipelines', create: 'createPipeline', get: 'getPipeline',
        update: 'updatePipeline', del: 'deletePipeline',
      },
      noun: 'pipeline',
    }),
    ...crudPaths({
      collection: '/api/v1/stages',
      itemPattern: '/api/v1/stages/{id}',
      tag: 'Stages',
      entityRef: '#/components/schemas/Stage',
      createRef: '#/components/schemas/StageCreate',
      patchRef: '#/components/schemas/StagePatch',
      ids: {
        list: 'listStages', create: 'createStage', get: 'getStage',
        update: 'updateStage', del: 'deleteStage',
      },
      noun: 'stage',
    }),
    ...crudPaths({
      collection: '/api/v1/deals',
      itemPattern: '/api/v1/deals/{id}',
      tag: 'Deals',
      entityRef: '#/components/schemas/Deal',
      createRef: '#/components/schemas/DealCreate',
      patchRef: '#/components/schemas/DealPatch',
      ids: {
        list: 'listDeals', create: 'createDeal', get: 'getDeal',
        update: 'updateDeal', del: 'deleteDeal',
      },
      noun: 'deal',
    }),
    '/api/v1/deals/{id}/history': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^deal_[a-z0-9]{21}$' } }],
      get: {
        operationId: 'listDealHistoryByDeal',
        summary: 'List the append-only history timeline for a deal',
        tags: ['DealHistory'],
        parameters: [
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 200 } },
          { name: 'cursor', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: {
          '200': DEAL_HISTORY_LIST_RESPONSE,
          '400': stdErrors['400'],
          '401': stdErrors['401'],
        },
      },
    },
    '/api/v1/deal-history/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^dhx_[a-z0-9]{21}$' } }],
      get: {
        operationId: 'getDealHistory',
        summary: 'Get a single deal-history row by id',
        tags: ['DealHistory'],
        responses: {
          '200': DEAL_HISTORY_ITEM_RESPONSE,
          '401': stdErrors['401'],
          '404': stdErrors['404'],
        },
      },
    },
  },
} as const;

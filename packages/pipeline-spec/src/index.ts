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
  '409': { description: 'Conflict (e.g., child rows still active)', content: { 'application/json': { schema: ERROR_REF } } },
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

export const pipelineSpec = {
  tags: [
    { name: 'Pipelines', description: 'Sales pipelines.' },
    { name: 'Stages', description: 'Stages within a pipeline.' },
    { name: 'Deals', description: 'Deals (opportunities) flowing through stages.' },
  ],
  components: {
    schemas: { ...pipelineSchemas, ...stageSchemas, ...dealSchemas },
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
  },
} as const;

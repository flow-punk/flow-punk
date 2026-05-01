import { eq } from 'drizzle-orm';
import { deals, pipelines, stages } from '@flowpunk-indie/db';
import {
  buildToolRegistry,
  type McpToolState,
  type ToolMetadata,
} from '@flowpunk/tool-registry';

import type { PipelineEnv } from '../types.js';
import { getDb, type Db } from '../handlers/_shared.js';

interface TenantPipelineExistence {
  hasPipelines: boolean;
  hasStages: boolean;
  /** Two or more active stages tenant-wide. Coarse approximation for the
   *  list-time gate of `deals_move_stage`; per-pipeline correctness is
   *  enforced at execute time by the deals repo's stage validation. */
  hasMultiStages: boolean;
  hasDeals: boolean;
}

async function checkExistence(db: Db): Promise<TenantPipelineExistence> {
  const [pipelinesRows, stagesRows, dealsRows] = await Promise.all([
    db.select({ id: pipelines.id }).from(pipelines).where(eq(pipelines.status, 'active')).limit(1),
    db.select({ id: stages.id }).from(stages).where(eq(stages.status, 'active')).limit(2),
    db.select({ id: deals.id }).from(deals).where(eq(deals.status, 'active')).limit(1),
  ]);
  return {
    hasPipelines: pipelinesRows.length > 0,
    hasStages: stagesRows.length > 0,
    hasMultiStages: stagesRows.length >= 2,
    hasDeals: dealsRows.length > 0,
  };
}

interface AvailabilityRule {
  toolName: string;
  available: (existence: TenantPipelineExistence) => boolean;
  reason: string;
  nextStep: string;
}

const AVAILABILITY_RULES: AvailabilityRule[] = [
  {
    toolName: 'pipeline_search',
    available: (e) => e.hasPipelines,
    reason: 'no pipelines exist for this tenant yet',
    nextStep: 'Create a pipeline via POST /api/v1/pipelines, then re-run tools/list.',
  },
  {
    toolName: 'stages_search',
    available: (e) => e.hasStages,
    reason: 'no stages exist for this tenant yet',
    nextStep: 'Create at least one stage via POST /api/v1/stages, then re-run tools/list.',
  },
  {
    toolName: 'deals_create',
    available: (e) => e.hasStages,
    reason: 'no stages exist — deals require a stage to land in',
    nextStep: 'Create at least one stage via POST /api/v1/stages, then re-run tools/list.',
  },
  {
    toolName: 'deals_search',
    available: (e) => e.hasDeals,
    reason: 'no deals exist for this tenant yet',
    nextStep: 'Call deals_create to add the first deal, then re-run tools/list.',
  },
  {
    toolName: 'deals_get',
    available: (e) => e.hasDeals,
    reason: 'no deals exist for this tenant yet',
    nextStep: 'Call deals_create to add the first deal, then re-run tools/list.',
  },
  {
    toolName: 'deals_update',
    available: (e) => e.hasDeals,
    reason: 'no deals exist for this tenant yet',
    nextStep: 'Call deals_create to add the first deal, then re-run tools/list.',
  },
  {
    toolName: 'deals_move_stage',
    available: (e) => e.hasDeals && e.hasMultiStages,
    reason: 'deals_move_stage requires at least one deal and a pipeline with two or more active stages',
    nextStep: 'Add a second stage to the deal\'s pipeline, then re-run tools/list.',
  },
];

const ALWAYS_AVAILABLE_TOOLS = new Set<string>(); // pipeline domain has no always-available tools

/**
 * Build the pipeline service's per-tenant tool state. List-time availability
 * is computed coarsely (existence-only). Per-pipeline correctness for
 * `deals_move_stage` (target stage in same pipeline as the deal) is enforced
 * at execute time via the deals repo's `assertStageInActivePipeline`.
 */
export async function buildPipelineToolState(env: PipelineEnv): Promise<McpToolState> {
  const db = getDb(env);
  const existence = await checkExistence(db);

  const registry = buildToolRegistry('all');
  const availableTools: ToolMetadata[] = [];
  const unavailableTools: ToolMetadata[] = [];

  for (const tool of registry.staticExecutableTools) {
    if (tool.service !== 'pipeline') continue;
    const rule = AVAILABILITY_RULES.find((r) => r.toolName === tool.name);
    const isAvailable = ALWAYS_AVAILABLE_TOOLS.has(tool.name)
      ? true
      : rule
        ? rule.available(existence)
        : true;

    if (isAvailable) {
      availableTools.push(tool);
    } else if (rule) {
      unavailableTools.push({
        ...tool,
        availability: {
          status: 'unavailable',
          reason: rule.reason,
          nextStep: rule.nextStep,
        },
      });
    }
  }

  return {
    availableTools,
    unavailableTools,
    dynamicTools: [],
  };
}

export async function handleMcpTools(env: PipelineEnv): Promise<Response> {
  const toolState = await buildPipelineToolState(env);
  return new Response(JSON.stringify({ toolState }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

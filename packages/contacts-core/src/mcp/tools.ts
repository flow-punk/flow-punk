import { eq } from 'drizzle-orm';
import { accounts, persons } from '@flowpunk-indie/db';
import {
  buildToolRegistry,
  type McpToolState,
  type ToolMetadata,
} from '@flowpunk/tool-registry';

import type { ContactsEnv } from '../types.js';
import { getDb, type Db } from '../handlers/_shared.js';

interface TenantContactsExistence {
  hasPersons: boolean;
  hasAccounts: boolean;
}

async function checkExistence(db: Db): Promise<TenantContactsExistence> {
  const [personsRows, accountsRows] = await Promise.all([
    db
      .select({ id: persons.id })
      .from(persons)
      .where(eq(persons.status, 'active'))
      .limit(1),
    db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.status, 'active'))
      .limit(1),
  ]);
  return {
    hasPersons: personsRows.length > 0,
    hasAccounts: accountsRows.length > 0,
  };
}

interface AvailabilityRule {
  toolName: string;
  available: (existence: TenantContactsExistence) => boolean;
  reason: string;
  nextStep: string;
}

const AVAILABILITY_RULES: AvailabilityRule[] = [
  {
    toolName: 'persons_search',
    available: (e) => e.hasPersons,
    reason: 'no person records exist for this tenant yet',
    nextStep: 'Call persons_create to add the first person, then re-run tools/list.',
  },
  {
    toolName: 'persons_get',
    available: (e) => e.hasPersons,
    reason: 'no person records exist for this tenant yet',
    nextStep: 'Call persons_create to add the first person, then re-run tools/list.',
  },
  {
    toolName: 'persons_update',
    available: (e) => e.hasPersons,
    reason: 'no person records exist for this tenant yet',
    nextStep: 'Call persons_create to add the first person, then re-run tools/list.',
  },
  {
    toolName: 'accounts_search',
    available: (e) => e.hasAccounts,
    reason: 'no account records exist for this tenant yet',
    nextStep: 'Call accounts_create to add the first account, then re-run tools/list.',
  },
  {
    toolName: 'accounts_get',
    available: (e) => e.hasAccounts,
    reason: 'no account records exist for this tenant yet',
    nextStep: 'Call accounts_create to add the first account, then re-run tools/list.',
  },
  {
    toolName: 'accounts_update',
    available: (e) => e.hasAccounts,
    reason: 'no account records exist for this tenant yet',
    nextStep: 'Call accounts_create to add the first account, then re-run tools/list.',
  },
  {
    toolName: 'contacts_search',
    available: (e) => e.hasPersons || e.hasAccounts,
    reason: 'no person or account records exist for this tenant yet',
    nextStep: 'Call persons_create or accounts_create to add a record first.',
  },
];

const ALWAYS_AVAILABLE_TOOLS = new Set(['persons_create', 'accounts_create']);

/**
 * Build the contacts service's per-tenant tool state. Tools backed by data
 * the tenant has not created yet are emitted as `unavailable` so the gateway
 * surfaces them via `tools_search` with `reason` + `nextStep` (ADR-006
 * §"Tool Availability Model"). Always-available tools (creates) and
 * data-gated tools live in the same registry — the difference is the
 * availability bit.
 */
export async function buildContactsToolState(env: ContactsEnv): Promise<McpToolState> {
  const db = getDb(env);
  const existence = await checkExistence(db);

  const registry = buildToolRegistry('all');
  const contactsDomain = registry.domainSeeds.find((seed) => seed.name === 'contacts');
  if (!contactsDomain) {
    return { availableTools: [], unavailableTools: [], dynamicTools: [] };
  }

  const availableTools: ToolMetadata[] = [];
  const unavailableTools: ToolMetadata[] = [];

  for (const tool of registry.staticExecutableTools) {
    if (tool.service !== 'contacts') continue;
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

export async function handleMcpTools(env: ContactsEnv): Promise<Response> {
  const toolState = await buildContactsToolState(env);
  return new Response(JSON.stringify({ toolState }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

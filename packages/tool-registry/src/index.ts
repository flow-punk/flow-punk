export type ToolScope = 'read' | 'write';

export type ToolKind = 'domain' | 'static' | 'dynamic';

export type McpServiceName =
  | 'gateway'
  | 'contacts'
  | 'pipeline'
  | 'automations'
  | 'forms'
  | 'cms';

export interface ToolAvailability {
  status: 'available' | 'unavailable';
  reason?: string;
  nextStep?: string;
}

export interface ToolMetadata {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  kind: ToolKind;
  domain: string;
  service: McpServiceName;
  requiredScope: ToolScope;
  availability: ToolAvailability;
  promotedTools?: string[];
  tools?: ToolMetadata[];
  keywords?: string[];
  deprecated?: boolean;
  deprecatedMessage?: string;
}

export interface ToolSearchResult {
  name: string;
  description: string;
  domain: string;
  service: McpServiceName;
  kind: Exclude<ToolKind, 'domain'>;
  availability: ToolAvailability;
  deprecated?: boolean;
  deprecatedMessage?: string;
}

export interface McpToolAdapterContext {
  tenantId?: string;
  userId?: string;
  scope?: string;
  credentialType?: 'apikey' | 'oauth';
  includeStaticCatalog?: boolean;
  availableTools?: ToolMetadata[];
  unavailableTools?: ToolMetadata[];
  dynamicTools?: ToolMetadata[];
  resolveDynamicToolMetadata?: (name: string) => ToolMetadata | null;
}

export interface McpToolState {
  availableTools: ToolMetadata[];
  unavailableTools: ToolMetadata[];
  dynamicTools: ToolMetadata[];
}

export interface McpToolAdapter {
  listAvailableTools(): ToolMetadata[];
  getToolMetadata(name: string): ToolMetadata | null;
  searchTools(query: string): ToolSearchResult[];
  requiredScopeForTool(name: string): ToolScope;
}

interface DomainSeed {
  name: string;
  description: string;
  promotedTools: string[];
  service: Exclude<McpServiceName, 'gateway'>;
  tools: ToolSeed[];
}

interface ToolSeed {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  requiredScope: ToolScope;
  keywords?: string[];
}

const available = (): ToolAvailability => ({ status: 'available' });

const staticDomainSeeds: DomainSeed[] = [
  {
    name: 'contacts',
    description:
      'Contacts and CRM records. Common actions: people_search, people_get, people_create.',
    promotedTools: ['people_search', 'people_get', 'people_create'],
    service: 'contacts',
    tools: [
      makeToolSeed('people_search', 'Search people records', searchSchema(), 'read'),
      makeToolSeed('people_get', 'Get a person by id', idSchema(), 'read'),
      makeToolSeed('people_create', 'Create a person record', objectSchema(), 'write'),
      makeToolSeed('people_update', 'Update a person record', idWithFieldsSchema(), 'write'),
      makeToolSeed('accounts_search', 'Search account records', searchSchema(), 'read'),
      makeToolSeed('accounts_get', 'Get an account by id', idSchema(), 'read'),
      makeToolSeed('accounts_create', 'Create an account record', objectSchema(), 'write'),
      makeToolSeed('accounts_update', 'Update an account record', idWithFieldsSchema(), 'write'),
      makeToolSeed('contacts_search', 'Search contacts records', searchSchema(), 'read'),
    ],
  },
  {
    name: 'pipeline',
    description:
      'Deals and pipeline state. Common actions: deals_search, deals_get, deals_create.',
    promotedTools: ['deals_search', 'deals_get', 'deals_create'],
    service: 'pipeline',
    tools: [
      makeToolSeed('deals_search', 'Search deals', searchSchema(), 'read'),
      makeToolSeed('deals_get', 'Get a deal by id', idSchema(), 'read'),
      makeToolSeed('deals_create', 'Create a deal', objectSchema(), 'write'),
      makeToolSeed('deals_update', 'Update a deal', idWithFieldsSchema(), 'write'),
      makeToolSeed(
        'deals_move_stage',
        'Move a deal to another stage',
        {
          type: 'object',
          properties: {
            id: { type: 'string' },
            stageId: { type: 'string' },
          },
          required: ['id', 'stageId'],
          additionalProperties: true,
        },
        'write',
      ),
      makeToolSeed('pipeline_search', 'Search pipelines', searchSchema(), 'read'),
      makeToolSeed('stages_search', 'Search stages', searchSchema(), 'read'),
    ],
  },
  {
    name: 'automations',
    description:
      'Workflow and automation control. Common actions: automations_search, automations_get, automations_trigger.',
    promotedTools: ['automations_search', 'automations_get', 'automations_trigger'],
    service: 'automations',
    tools: [
      makeToolSeed('automations_search', 'Search automations', searchSchema(), 'read'),
      makeToolSeed('automations_get', 'Get an automation by id', idSchema(), 'read'),
      makeToolSeed('automations_trigger', 'Trigger an automation', idSchema(), 'write'),
      makeToolSeed('workflows_search', 'Search workflows', searchSchema(), 'read'),
      makeToolSeed('workflows_get', 'Get a workflow by id', idSchema(), 'read'),
    ],
  },
  {
    name: 'forms',
    description: 'Form inputs and submissions. Common actions: forms_search, forms_get.',
    promotedTools: ['forms_search', 'forms_get'],
    service: 'forms',
    tools: [
      makeToolSeed('forms_search', 'Search forms', searchSchema(), 'read'),
      makeToolSeed('forms_get', 'Get a form by id', idSchema(), 'read'),
      makeToolSeed('forms_submit', 'Submit a form response', objectSchema(), 'write'),
    ],
  },
  {
    name: 'cms',
    description:
      'Collections and CMS entries. Common actions: collections_search, collections_get, collections_create.',
    promotedTools: ['collections_search', 'collections_get', 'collections_create'],
    service: 'cms',
    tools: [
      makeToolSeed('collections_search', 'Search collections', searchSchema(), 'read'),
      makeToolSeed('collections_get', 'Get a collection by id', idSchema(), 'read'),
      makeToolSeed('collections_create', 'Create a collection', objectSchema(), 'write'),
      makeToolSeed('collections_update', 'Update a collection', idWithFieldsSchema(), 'write'),
      makeToolSeed('collections_delete', 'Delete a collection', idSchema(), 'write'),
      makeToolSeed('cms_entries_search', 'Search CMS entries', searchSchema(), 'read'),
    ],
  },
];

const toolsSearchMetadata: ToolMetadata = {
  name: 'tools_search',
  description:
    'Search tenant-aware MCP tools, including unavailable and dynamic tools, with setup guidance when relevant.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
    },
    additionalProperties: false,
  },
  kind: 'static',
  domain: 'gateway',
  service: 'gateway',
  requiredScope: 'read',
  availability: available(),
  keywords: ['search', 'discover', 'tools', 'catalog'],
};

const staticExecutableTools = staticDomainSeeds.flatMap((domain) =>
  domain.tools.map<ToolMetadata>((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    kind: 'static',
    domain: domain.name,
    service: domain.service,
    requiredScope: tool.requiredScope,
    availability: available(),
    keywords: tool.keywords,
  })),
);

const staticExecutableToolMap = new Map<string, ToolMetadata>(
  staticExecutableTools.map((tool) => [tool.name, tool]),
);

const staticDomainTools = staticDomainSeeds.map<ToolMetadata>((domain) => {
  const tools = staticExecutableTools.filter((tool) => tool.domain === domain.name);
  return {
    name: domain.name,
    description: domain.description,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['expand'],
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
    kind: 'domain',
    domain: domain.name,
    service: domain.service,
    requiredScope: 'read',
    availability: available(),
    promotedTools: domain.promotedTools,
    tools,
    keywords: [domain.name, ...domain.promotedTools],
  };
});

const staticDomainToolMap = new Map<string, ToolMetadata>(
  staticDomainTools.map((tool) => [tool.name, tool]),
);

export function createMcpToolAdapter(
  context: McpToolAdapterContext = {},
): McpToolAdapter {
  const includeStaticCatalog = context.includeStaticCatalog ?? true;
  const unavailableTools = context.unavailableTools ?? [];
  const dynamicTools = context.dynamicTools ?? [];
  const availableExecutables = dedupeTools([
    ...(includeStaticCatalog ? staticExecutableTools : []),
    ...dynamicTools.filter((tool) => tool.availability.status === 'available'),
    ...(context.availableTools ?? []),
  ]);
  const discoverableExecutables = dedupeTools([
    ...availableExecutables,
    ...unavailableTools,
    ...dynamicTools.filter((tool) => tool.availability.status === 'unavailable'),
  ]);

  const discoverableExecutableMap = new Map<string, ToolMetadata>(
    discoverableExecutables.map((tool) => [tool.name, tool]),
  );

  const domainTools = buildDomainTools(availableExecutables);
  const domainToolMap = new Map<string, ToolMetadata>(
    domainTools.map((tool) => [tool.name, tool]),
  );

  return {
    listAvailableTools(): ToolMetadata[] {
      return [...domainTools, toolsSearchMetadata];
    },

    getToolMetadata(name: string): ToolMetadata | null {
      return (
        domainToolMap.get(name) ??
        discoverableExecutableMap.get(name) ??
        resolveStaticToolMetadata(name) ??
        context.resolveDynamicToolMetadata?.(name) ??
        null
      );
    },

    searchTools(query: string): ToolSearchResult[] {
      const needle = normalizeSearchText(query);
      const results = discoverableExecutables
        .filter((tool) => matchesQuery(tool, needle))
        .map<ToolSearchResult>((tool) => ({
          name: tool.name,
          description: tool.description,
          domain: tool.domain,
          service: tool.service,
          kind: tool.kind === 'domain' ? 'static' : tool.kind,
          availability: tool.availability,
          deprecated: tool.deprecated,
          deprecatedMessage: tool.deprecatedMessage,
        }))
        .sort((left, right) => left.name.localeCompare(right.name));

      return results;
    },

    requiredScopeForTool(name: string): ToolScope {
      return (
        domainToolMap.get(name)?.requiredScope ??
        discoverableExecutableMap.get(name)?.requiredScope ??
        context.resolveDynamicToolMetadata?.(name)?.requiredScope ??
        'write'
      );
    },
  };

  function resolveStaticToolMetadata(name: string): ToolMetadata | null {
    if (!includeStaticCatalog) {
      return toolsSearchMetadata.name === name ? toolsSearchMetadata : null;
    }
    return (
      staticDomainToolMap.get(name) ??
      staticExecutableToolMap.get(name) ??
      (toolsSearchMetadata.name === name ? toolsSearchMetadata : null)
    );
  }

  function buildDomainTools(executableTools: ToolMetadata[]): ToolMetadata[] {
    return staticDomainSeeds
      .map<ToolMetadata | null>((domain) => {
        const tools = executableTools.filter((tool) => tool.domain === domain.name);
        if (tools.length === 0) return null;

        return {
          name: domain.name,
          description: domain.description,
          inputSchema: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: ['expand'],
              },
            },
            required: ['action'],
            additionalProperties: false,
          },
          kind: 'domain',
          domain: domain.name,
          service: domain.service,
          requiredScope: 'read',
          availability: available(),
          promotedTools: domain.promotedTools.filter((toolName) =>
            tools.some((tool) => tool.name === toolName),
          ),
          tools,
          keywords: [domain.name, ...domain.promotedTools],
        };
      })
      .filter((tool): tool is ToolMetadata => tool !== null);
  }

  function matchesQuery(tool: ToolMetadata, needle: string): boolean {
    if (needle === '') return true;
    const haystacks = [
      tool.name,
      tool.description,
      tool.domain,
      tool.service,
      ...(tool.keywords ?? []),
      ...(tool.availability.reason ? [tool.availability.reason] : []),
      ...(tool.availability.nextStep ? [tool.availability.nextStep] : []),
    ];
    return haystacks.some((entry) =>
      normalizeSearchText(entry).includes(needle),
    );
  }
}

function dedupeTools(tools: ToolMetadata[]): ToolMetadata[] {
  const deduped = new Map<string, ToolMetadata>();
  for (const tool of tools) deduped.set(tool.name, tool);
  return [...deduped.values()];
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

function makeToolSeed(
  name: string,
  description: string,
  inputSchema: Record<string, unknown>,
  requiredScope: ToolScope,
  keywords?: string[],
): ToolSeed {
  return {
    name,
    description,
    inputSchema,
    requiredScope,
    keywords,
  };
}

function searchSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      query: { type: 'string' },
      limit: { type: 'number' },
      cursor: { type: 'string' },
    },
    additionalProperties: true,
  };
}

function idSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      id: { type: 'string' },
    },
    required: ['id'],
    additionalProperties: true,
  };
}

function idWithFieldsSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      id: { type: 'string' },
      fields: { type: 'object' },
    },
    required: ['id'],
    additionalProperties: true,
  };
}

function objectSchema(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: true,
  };
}

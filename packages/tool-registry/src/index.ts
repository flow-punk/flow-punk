export type ToolScope = 'read' | 'write';

export type ToolKind = 'domain' | 'static' | 'dynamic';

export type Edition = 'all' | 'managed';

export type McpServiceName = 'gateway' | 'contacts' | 'pipeline';

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
  edition: Edition;
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

export interface ToolRegistry {
  edition: Edition;
  domainSeeds: DomainSeed[];
  staticExecutableTools: ToolMetadata[];
  staticDomainTools: ToolMetadata[];
  toolsSearch: ToolMetadata;
}

interface DomainSeed {
  name: string;
  description: string;
  promotedTools: string[];
  service: Exclude<McpServiceName, 'gateway'>;
  edition: Edition;
  tools: ToolSeed[];
}

interface ToolSeed {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  requiredScope: ToolScope;
  edition: Edition;
  keywords?: string[];
}

const available = (): ToolAvailability => ({ status: 'available' });

const ALL_DOMAIN_SEEDS: DomainSeed[] = [
  {
    name: 'contacts',
    description:
      'Contacts and CRM records. Common actions: persons_search, persons_get, persons_create.',
    promotedTools: ['persons_search', 'persons_get', 'persons_create'],
    service: 'contacts',
    edition: 'all',
    tools: [
      makeToolSeed('persons_search', 'Search person records', searchSchema(), 'read'),
      makeToolSeed('persons_get', 'Get a person by id', idSchema(), 'read'),
      makeToolSeed('persons_create', 'Create a person record', objectSchema(), 'write'),
      makeToolSeed('persons_update', 'Update a person record', idWithFieldsSchema(), 'write'),
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
    edition: 'all',
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
];

const TOOLS_SEARCH_METADATA: ToolMetadata = {
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
  edition: 'all',
  keywords: ['search', 'discover', 'tools', 'catalog'],
};

/**
 * Build a per-edition tool registry. Edition filtering happens at registry build
 * time inside each gateway wrapper; the adapter contract itself stays
 * edition-agnostic per ADR-006 §"Tool Availability Model".
 *
 * - `'all'` includes only tools/domains marked `edition: 'all'`.
 * - `'managed'` includes both `'all'` and `'managed'` (managed is a superset).
 */
export function buildToolRegistry(edition: Edition): ToolRegistry {
  const includeManaged = edition === 'managed';
  const domainSeeds = ALL_DOMAIN_SEEDS
    .filter((seed) => seed.edition === 'all' || (includeManaged && seed.edition === 'managed'))
    .map<DomainSeed>((seed) => ({
      ...seed,
      tools: seed.tools.filter((tool) => tool.edition === 'all' || (includeManaged && tool.edition === 'managed')),
    }));

  const staticExecutableTools = domainSeeds.flatMap((domain) =>
    domain.tools.map<ToolMetadata>((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      kind: 'static',
      domain: domain.name,
      service: domain.service,
      requiredScope: tool.requiredScope,
      availability: available(),
      edition: tool.edition,
      keywords: tool.keywords,
    })),
  );

  const staticDomainTools = domainSeeds.map<ToolMetadata>((domain) => ({
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
    edition: domain.edition,
    promotedTools: domain.promotedTools.filter((toolName) =>
      domain.tools.some((tool) => tool.name === toolName),
    ),
    tools: staticExecutableTools.filter((tool) => tool.domain === domain.name),
    keywords: [domain.name, ...domain.promotedTools],
  }));

  return {
    edition,
    domainSeeds,
    staticExecutableTools,
    staticDomainTools,
    toolsSearch: TOOLS_SEARCH_METADATA,
  };
}

const DEFAULT_REGISTRY = buildToolRegistry('all');

export function createMcpToolAdapter(
  context: McpToolAdapterContext = {},
  registry: ToolRegistry = DEFAULT_REGISTRY,
): McpToolAdapter {
  const includeStaticCatalog = context.includeStaticCatalog ?? true;
  const unavailableTools = context.unavailableTools ?? [];
  const dynamicTools = context.dynamicTools ?? [];
  const availableExecutables = dedupeTools([
    ...(includeStaticCatalog ? registry.staticExecutableTools : []),
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

  const staticDomainToolMap = new Map<string, ToolMetadata>(
    registry.staticDomainTools.map((tool) => [tool.name, tool]),
  );
  const staticExecutableToolMap = new Map<string, ToolMetadata>(
    registry.staticExecutableTools.map((tool) => [tool.name, tool]),
  );

  const domainTools = buildDomainTools(availableExecutables, registry.domainSeeds);
  const domainToolMap = new Map<string, ToolMetadata>(
    domainTools.map((tool) => [tool.name, tool]),
  );

  return {
    listAvailableTools(): ToolMetadata[] {
      return [...domainTools, registry.toolsSearch];
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
      return registry.toolsSearch.name === name ? registry.toolsSearch : null;
    }
    return (
      staticDomainToolMap.get(name) ??
      staticExecutableToolMap.get(name) ??
      (registry.toolsSearch.name === name ? registry.toolsSearch : null)
    );
  }

  function buildDomainTools(
    executableTools: ToolMetadata[],
    domainSeeds: DomainSeed[],
  ): ToolMetadata[] {
    return domainSeeds
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
          edition: domain.edition,
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
    edition: 'all',
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

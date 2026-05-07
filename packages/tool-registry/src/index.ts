export type ToolScope = 'read' | 'write';

export type ToolKind = 'model' | 'action' | 'dynamic';

export type Edition = 'indie' | 'managed';

export type McpServiceName = 'gateway' | 'contacts' | 'pipeline';

export interface ToolAvailability {
  status: 'available' | 'unavailable';
  reason?: string;
  nextStep?: string;
}

export interface ToolActionMetadata {
  action: string;
  downstreamName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  requiredScope: ToolScope;
  availability: ToolAvailability;
  service: Exclude<McpServiceName, 'gateway'>;
  model: string;
  editions: Edition[];
  examples?: Array<Record<string, unknown>>;
  keywords?: string[];
}

export interface ToolMetadata {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  kind: ToolKind;
  model: string;
  service: McpServiceName;
  requiredScope: ToolScope;
  availability: ToolAvailability;
  editions: Edition[];
  actions?: ToolActionMetadata[];
  action?: string;
  downstreamName?: string;
  keywords?: string[];
  deprecated?: boolean;
  deprecatedMessage?: string;
}

export interface ToolSearchResult {
  name: string;
  description: string;
  model: string;
  service: McpServiceName;
  kind: Exclude<ToolKind, 'model'>;
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

export interface ModelActionCall {
  model: string;
  action: string;
  downstreamName: string;
  arguments: Record<string, unknown>;
  metadata: ToolActionMetadata;
}

export interface ModelActionDescription {
  model: string;
  action: string;
  downstreamName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  requiredScope: ToolScope;
  availability: ToolAvailability;
  examples?: Array<Record<string, unknown>>;
}

export interface McpToolAdapter {
  listAvailableTools(): ToolMetadata[];
  getToolMetadata(name: string): ToolMetadata | null;
  resolveModelAction(name: string, args: Record<string, unknown> | undefined): ModelActionCall | null;
  describeModelAction(name: string, args: Record<string, unknown> | undefined): ModelActionDescription | null;
  requiredScopeForTool(name: string, args?: Record<string, unknown>): ToolScope;
}

export interface ToolRegistry {
  edition: Edition;
  modelTools: ToolMetadata[];
  staticExecutableTools: ToolMetadata[];
}

interface ModelSeed {
  name: string;
  description: string;
  service: Exclude<McpServiceName, 'gateway'>;
  editions: Edition[];
  actions: ActionSeed[];
  keywords?: string[];
}

interface ActionSeed {
  action: string;
  downstreamName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  requiredScope: ToolScope;
  editions: Edition[];
  examples?: Array<Record<string, unknown>>;
  keywords?: string[];
}

const SHARED_EDITIONS: Edition[] = ['indie', 'managed'];

const available = (): ToolAvailability => ({ status: 'available' });

const MODEL_SEEDS: ModelSeed[] = [
  {
    name: 'persons',
    description:
      'Individual human contacts. A person can stand alone or link to an account with accountId when they belong to a company or organization.',
    service: 'contacts',
    editions: SHARED_EDITIONS,
    keywords: ['people', 'contacts', 'individuals'],
    actions: [
      makeActionSeed('search', 'persons_search', 'Search person records', searchSchema(), 'read'),
      makeActionSeed('get', 'persons_get', 'Get a person by id', idSchema(), 'read'),
      makeActionSeed('create', 'persons_create', 'Create a person record', personCreateSchema(), 'write', [
        {
          displayName: 'Alex Morgan',
          emailPrimary: 'alex.morgan@example.com',
          phone1Number: '+15551234567',
          title: 'Marketing Manager',
        },
      ]),
      makeActionSeed('update', 'persons_update', 'Update a person record', idWithFieldsSchema(personPatchSchema()), 'write'),
    ],
  },
  {
    name: 'accounts',
    description:
      'Companies, organizations, or households. Accounts can group many persons and can be referenced from persons through accountId.',
    service: 'contacts',
    editions: SHARED_EDITIONS,
    keywords: ['companies', 'organizations', 'businesses'],
    actions: [
      makeActionSeed('search', 'accounts_search', 'Search account records', searchSchema(), 'read'),
      makeActionSeed('get', 'accounts_get', 'Get an account by id', idSchema(), 'read'),
      makeActionSeed('create', 'accounts_create', 'Create an account record', accountCreateSchema(), 'write', [
        {
          displayName: 'Acme Corp',
          domain: 'acme.example',
          website: 'https://acme.example',
          industry: 'Manufacturing',
        },
      ]),
      makeActionSeed('update', 'accounts_update', 'Update an account record', idWithFieldsSchema(accountPatchSchema()), 'write'),
    ],
  },
  {
    name: 'deals',
    description:
      'Sales opportunities. Deals move through stages in a pipeline and may reference related account or person records.',
    service: 'pipeline',
    editions: SHARED_EDITIONS,
    keywords: ['opportunities', 'sales'],
    actions: [
      makeActionSeed('search', 'deals_search', 'Search deals', dealSearchSchema(), 'read'),
      makeActionSeed('get', 'deals_get', 'Get a deal by id', idSchema(), 'read'),
      makeActionSeed('create', 'deals_create', 'Create a deal', dealCreateSchema(), 'write'),
      makeActionSeed('update', 'deals_update', 'Update a deal', idWithFieldsSchema(dealPatchSchema()), 'write'),
      makeActionSeed('move_stage', 'deals_move_stage', 'Move a deal to another stage', moveStageSchema(), 'write'),
    ],
  },
  {
    name: 'pipelines',
    description:
      'Sales processes that contain ordered stages. Deals belong to one pipeline and move through its stages.',
    service: 'pipeline',
    editions: SHARED_EDITIONS,
    keywords: ['sales process'],
    actions: [
      makeActionSeed('create', 'pipeline_create', 'Create a pipeline with either the standard sales template or 2-12 custom stages', pipelineCreateSchema(), 'write', [
        {
          name: 'Sales',
          template: 'standard_sales',
          isDefault: true,
        },
        {
          name: 'Enterprise Sales',
          stages: [
            { name: 'Discovery', position: 0, probability: 10 },
            { name: 'Agreement', position: 1, terminalKind: 'won', probability: 100 },
          ],
        },
      ]),
      makeActionSeed('search', 'pipeline_search', 'Search pipelines', searchSchema(), 'read'),
    ],
  },
  {
    name: 'stages',
    description:
      'Steps within a pipeline. Each stage belongs to a pipeline, and deals move between stages.',
    service: 'pipeline',
    editions: SHARED_EDITIONS,
    keywords: ['pipeline steps'],
    actions: [
      makeActionSeed('create', 'stages_create', 'Add one stage to an existing active pipeline after it has been created', stageCreateSchema(), 'write'),
      makeActionSeed('search', 'stages_search', 'Search stages in a pipeline', stagesSearchSchema(), 'read'),
      makeActionSeed('delete', 'stages_delete', 'Soft-delete an empty stage while preserving at least two active stages in the pipeline', idSchema(), 'write'),
    ],
  },
];

export function buildToolRegistry(
  edition: Edition,
  supplementalModels: ModelSeed[] = [],
): ToolRegistry {
  const seeds = [...MODEL_SEEDS, ...supplementalModels]
    .filter((seed) => seed.editions.includes(edition))
    .map<ModelSeed>((seed) => ({
      ...seed,
      actions: seed.actions.filter((action) => action.editions.includes(edition)),
    }))
    .filter((seed) => seed.actions.length > 0);

  const staticExecutableTools = seeds.flatMap((model) =>
    model.actions.map<ToolMetadata>((action) => ({
      name: action.downstreamName,
      description: action.description,
      inputSchema: action.inputSchema,
      kind: 'action',
      model: model.name,
      service: model.service,
      requiredScope: action.requiredScope,
      availability: available(),
      editions: action.editions,
      action: action.action,
      downstreamName: action.downstreamName,
      keywords: action.keywords,
    })),
  );

  const executableByName = new Map(staticExecutableTools.map((tool) => [tool.name, tool]));
  const modelTools = seeds.map<ToolMetadata>((model) =>
    toModelTool(model, model.actions.map((action) => executableByName.get(action.downstreamName)).filter(isToolMetadata)),
  );

  return {
    edition,
    modelTools,
    staticExecutableTools,
  };
}

export function composeToolRegistries(
  base: ToolRegistry,
  supplement: ToolRegistry,
): ToolRegistry {
  return {
    edition: base.edition,
    modelTools: dedupeTools([...base.modelTools, ...supplement.modelTools]),
    staticExecutableTools: dedupeTools([
      ...base.staticExecutableTools,
      ...supplement.staticExecutableTools,
    ]),
  };
}

const DEFAULT_REGISTRY = buildToolRegistry('indie');

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

  const availableExecutableMap = new Map(availableExecutables.map((tool) => [tool.name, tool]));
  const discoverableExecutableMap = new Map(discoverableExecutables.map((tool) => [tool.name, tool]));
  const modelTools = buildModelTools(registry.modelTools, availableExecutableMap);
  const discoverableModelTools = buildModelTools(registry.modelTools, discoverableExecutableMap);
  const modelToolMap = new Map(modelTools.map((tool) => [tool.name, tool]));
  const discoverableModelToolMap = new Map(discoverableModelTools.map((tool) => [tool.name, tool]));

  return {
    listAvailableTools(): ToolMetadata[] {
      return modelTools;
    },

    getToolMetadata(name: string): ToolMetadata | null {
      return modelToolMap.get(name) ?? null;
    },

    resolveModelAction(name: string, args: Record<string, unknown> | undefined): ModelActionCall | null {
      const parsed = parseModelActionArgs(args);
      if (!parsed || parsed.action === 'describe') return null;
      const action = availableActionForModel(name, parsed.action);
      if (!action || action.availability.status !== 'available') return null;
      return {
        model: name,
        action: parsed.action,
        downstreamName: action.downstreamName,
        arguments: parsed.arguments,
        metadata: action,
      };
    },

    describeModelAction(name: string, args: Record<string, unknown> | undefined): ModelActionDescription | null {
      const parsed = parseModelActionArgs(args);
      if (!parsed || parsed.action !== 'describe') return null;
      const requested = typeof parsed.arguments.action === 'string'
        ? parsed.arguments.action
        : undefined;
      if (!requested) return null;
      const action = discoverableActionForModel(name, requested);
      if (!action) return null;
      return {
        model: name,
        action: action.action,
        downstreamName: action.downstreamName,
        description: action.description,
        inputSchema: action.inputSchema,
        requiredScope: action.requiredScope,
        availability: action.availability,
        examples: action.examples,
      };
    },

    requiredScopeForTool(name: string, args?: Record<string, unknown>): ToolScope {
      const parsed = parseModelActionArgs(args);
      if (parsed) {
        if (parsed.action === 'describe') return 'read';
        return discoverableActionForModel(name, parsed.action)?.requiredScope ?? 'write';
      }
      return modelToolMap.get(name)?.requiredScope ?? 'write';
    },
  };

  function availableActionForModel(modelName: string, actionName: string): ToolActionMetadata | null {
    const model = modelToolMap.get(modelName);
    return model?.actions?.find((action) => action.action === actionName) ?? null;
  }

  function discoverableActionForModel(modelName: string, actionName: string): ToolActionMetadata | null {
    const model = discoverableModelToolMap.get(modelName);
    return model?.actions?.find((action) => action.action === actionName) ?? null;
  }
}

function buildModelTools(
  modelSeeds: ToolMetadata[],
  executableMap: Map<string, ToolMetadata>,
): ToolMetadata[] {
  return modelSeeds
    .map<ToolMetadata | null>((model) => {
      const actions = (model.actions ?? [])
        .map((action) => {
          const executable = executableMap.get(action.downstreamName);
          if (!executable) return null;
          return {
            ...action,
            availability: executable.availability,
          };
        })
        .filter((action): action is ToolActionMetadata => action !== null);
      if (actions.length === 0) return null;
      return {
        ...model,
        inputSchema: modelInputSchema(actions),
        actions,
      };
    })
    .filter((tool): tool is ToolMetadata => tool !== null);
}

function toModelTool(model: ModelSeed, actions: ToolMetadata[]): ToolMetadata {
  const actionMetadata = actions.map<ToolActionMetadata>((tool) => ({
    action: tool.action ?? tool.name,
    downstreamName: tool.downstreamName ?? tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    requiredScope: tool.requiredScope,
    availability: tool.availability,
    service: model.service,
    model: model.name,
    editions: tool.editions,
    examples: model.actions.find((action) => action.downstreamName === tool.name)?.examples,
    keywords: tool.keywords,
  }));
  return {
    name: model.name,
    description: model.description,
    inputSchema: modelInputSchema(actionMetadata),
    kind: 'model',
    model: model.name,
    service: model.service,
    requiredScope: 'read',
    availability: available(),
    editions: model.editions,
    actions: actionMetadata,
    keywords: model.keywords,
  };
}

function modelInputSchema(actions: ToolActionMetadata[]): Record<string, unknown> {
  const actionNames = ['describe', ...actions.map((action) => action.action)];
  return {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: actionNames,
        description:
          'Use describe to inspect a single action schema, then call an executable action with arguments.',
      },
      arguments: {
        type: 'object',
        description:
          'For describe, pass { action: "<action>" }. For executable actions, pass that action\'s arguments.',
        additionalProperties: true,
      },
    },
    required: ['action'],
    additionalProperties: false,
  };
}

function parseModelActionArgs(
  args: Record<string, unknown> | undefined,
): { action: string; arguments: Record<string, unknown> } | null {
  if (!args || typeof args.action !== 'string') return null;
  const rawArgs = args.arguments;
  return {
    action: args.action,
    arguments:
      rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)
        ? rawArgs as Record<string, unknown>
        : {},
  };
}

function dedupeTools(tools: ToolMetadata[]): ToolMetadata[] {
  const deduped = new Map<string, ToolMetadata>();
  for (const tool of tools) deduped.set(tool.name, tool);
  return [...deduped.values()];
}

function isToolMetadata(value: ToolMetadata | undefined): value is ToolMetadata {
  return value !== undefined;
}

function makeActionSeed(
  action: string,
  downstreamName: string,
  description: string,
  inputSchema: Record<string, unknown>,
  requiredScope: ToolScope,
  examples?: Array<Record<string, unknown>>,
  keywords?: string[],
): ActionSeed {
  return {
    action,
    downstreamName,
    description,
    inputSchema,
    requiredScope,
    editions: SHARED_EDITIONS,
    examples,
    keywords,
  };
}

function searchSchema(extraProperties: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      query: { type: 'string' },
      limit: { type: 'number' },
      cursor: { type: 'string' },
      ...extraProperties,
    },
    additionalProperties: false,
  };
}

function idSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      id: { type: 'string' },
    },
    required: ['id'],
    additionalProperties: false,
  };
}

function idWithFieldsSchema(fieldsSchema: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      id: { type: 'string' },
      fields: fieldsSchema,
    },
    required: ['id', 'fields'],
    additionalProperties: false,
  };
}

function stagesSearchSchema(): Record<string, unknown> {
  return searchSchema({ pipelineId: { type: 'string' } });
}

function pipelineCreateSchema(): Record<string, unknown> {
  return objectSchema({
    name: { type: 'string', description: 'Pipeline name.' },
    description: { type: 'string', description: 'Optional pipeline description.' },
    isDefault: { type: 'boolean', description: 'Whether this should be the default active pipeline.' },
    template: {
      type: 'string',
      enum: ['standard_sales'],
      description:
        'Use this for the built-in stages: New, Qualified, Proposal, Agreement, Complete, Closed Lost. Do not send stages when using template.',
    },
    stages: {
      type: 'array',
      description:
        'Custom stages to create with the pipeline. Use this instead of template. Must contain 2-12 stages, positions must be unique and contiguous from 0, and at least one stage must have terminalKind "won".',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Stage label.' },
          position: { type: 'number', description: 'Zero-based stage order. Must be contiguous from 0.' },
          terminalKind: {
            type: 'string',
            enum: ['won', 'lost'],
            description: 'Set "won" for a successful terminal stage or "lost" for an unsuccessful terminal stage.',
          },
          probability: { type: 'number', description: 'Optional probability from 0 to 100.' },
        },
        required: ['name', 'position'],
        additionalProperties: false,
      },
    },
  }, ['name']);
}

function stageCreateSchema(): Record<string, unknown> {
  return objectSchema({
    pipelineId: { type: 'string', description: 'Existing active pipeline id.' },
    name: { type: 'string', description: 'Stage label.' },
    position: { type: 'number', description: 'Zero-based stage order within the pipeline.' },
    terminalKind: {
      type: 'string',
      enum: ['won', 'lost'],
      description: 'Set only for terminal outcome stages.',
    },
    probability: { type: 'number', description: 'Optional probability from 0 to 100.' },
  }, ['pipelineId', 'name', 'position']);
}

function dealSearchSchema(): Record<string, unknown> {
  return searchSchema({
    pipelineId: { type: 'string' },
    stageId: { type: 'string' },
  });
}

function moveStageSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      id: { type: 'string' },
      stageId: { type: 'string' },
    },
    required: ['id', 'stageId'],
    additionalProperties: false,
  };
}

function personCreateSchema(): Record<string, unknown> {
  return objectSchema({
    accountId: { type: 'string' },
    displayName: { type: 'string' },
    firstName: { type: 'string' },
    lastName: { type: 'string' },
    emailPrimary: { type: 'string' },
    phone1CountryCode: { type: 'string' },
    phone1Number: { type: 'string' },
    phone1Ext: { type: 'string' },
    phone1Type: { type: 'string', enum: ['mobile', 'landline', 'voip', 'fax', 'other'] },
    title: { type: 'string' },
    streetLine1: { type: 'string' },
    streetLine2: { type: 'string' },
    city: { type: 'string' },
    region: { type: 'string' },
    postalCode: { type: 'string' },
    country: { type: 'string' },
    latitude: { type: 'number' },
    longitude: { type: 'number' },
    imageAvatar: { type: 'string' },
    consentEmail: { type: 'string', enum: ['subscribed', 'unsubscribed', 'no_consent'] },
  }, ['displayName']);
}

function personPatchSchema(): Record<string, unknown> {
  return personCreateSchema();
}

function accountCreateSchema(): Record<string, unknown> {
  return objectSchema({
    displayName: { type: 'string' },
    domain: { type: 'string' },
    website: { type: 'string' },
    industry: { type: 'string' },
    streetLine1: { type: 'string' },
    streetLine2: { type: 'string' },
    city: { type: 'string' },
    region: { type: 'string' },
    postalCode: { type: 'string' },
    country: { type: 'string' },
    latitude: { type: 'number' },
    longitude: { type: 'number' },
    phone1CountryCode: { type: 'string' },
    phone1Number: { type: 'string' },
    phone1Ext: { type: 'string' },
    phone2CountryCode: { type: 'string' },
    phone2Number: { type: 'string' },
    phone2Ext: { type: 'string' },
    imageLogo: { type: 'string' },
  }, ['displayName']);
}

function accountPatchSchema(): Record<string, unknown> {
  return accountCreateSchema();
}

function dealCreateSchema(): Record<string, unknown> {
  return objectSchema({
    name: { type: 'string' },
    pipelineId: { type: 'string' },
    stageId: { type: 'string' },
    accountId: { type: 'string' },
    primaryPersonId: { type: 'string' },
    ownerUserId: { type: 'string' },
    amount: { type: 'number' },
    currency: { type: 'string' },
    closeDate: { type: 'string' },
    probability: { type: 'number' },
    description: { type: 'string' },
  }, ['name', 'pipelineId', 'stageId']);
}

function dealPatchSchema(): Record<string, unknown> {
  return dealCreateSchema();
}

function objectSchema(
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> {
  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
}

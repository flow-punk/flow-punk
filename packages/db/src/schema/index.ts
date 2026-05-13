export * from './users.js';
export * from './mcp-sessions.js';
export * from './auth-login-tokens.js';
export * from './api-keys.js';

// Per-table modules each export their own `ALLOWED_PATCH_FIELDS`,
// `IMMUTABLE_PATCH_FIELDS`, `NULLABLE_PATCH_FIELDS`, etc. — names collide
// across tables. Re-export only the table object and its row/status types
// at the package root; consumers that need patch-field metadata import
// from the matching schema file (which is what the matching repo file
// already does).
export {
  accounts,
  type Account,
  type AccountStatus,
  type AccountPatchableField,
  type NewAccount,
} from './accounts.js';
export {
  persons,
  type Person,
  type PersonStatus,
  type PersonPatchableField,
  type Phone1Type,
  type EmailConsent,
  type NewPerson,
} from './persons.js';
export {
  pipelines,
  type Pipeline,
  type PipelineStatus,
  type PipelinePatchableField,
  type NewPipeline,
} from './pipelines.js';
export {
  stages,
  type Stage,
  type StageStatus,
  type StageTerminalKind,
  type StagePatchableField,
  type NewStage,
} from './stages.js';
export {
  deals,
  type Deal,
  type DealStatus,
  type DealPatchableField,
  type NewDeal,
} from './deals.js';
export {
  dealContacts,
  type DealContact,
  type DealContactRole,
  type NewDealContact,
  DEAL_CONTACT_ROLE_VALUES,
} from './deal-contacts.js';
export {
  dealHistory,
  type DealHistoryRow,
  type DealHistoryKind,
  type DealHistoryCredentialType,
  type NewDealHistoryRow,
  DEAL_HISTORY_KINDS,
  DEAL_HISTORY_CREDENTIAL_TYPES,
} from './deal-history.js';
export {
  customFieldDefs,
  type CustomFieldDef,
  type CustomFieldBaseModel,
  type CustomFieldFilterableStatus,
  type NewCustomFieldDef,
  CUSTOM_FIELD_BASE_MODELS,
  CUSTOM_FIELD_FILTERABLE_STATUSES,
  CUSTOM_FIELD_NAME_REGEX,
  CUSTOM_FIELD_CAPS,
  FILTERABLE_TRANSITIONS,
  isAllowedFilterableTransition,
} from './custom-field-defs.js';
export {
  mcpOauthClients,
  type McpOauthClient,
  type NewMcpOauthClient,
} from './mcp-oauth-clients.js';
export {
  mcpOauthTokens,
  type McpOauthToken,
  type NewMcpOauthToken,
} from './mcp-oauth-tokens.js';
export {
  mcpOauthCodes,
  type McpOauthCode,
  type NewMcpOauthCode,
} from './mcp-oauth-codes.js';
export {
  mcpOauthAuthorizeRequests,
  type McpOauthAuthorizeRequest,
  type NewMcpOauthAuthorizeRequest,
} from './mcp-oauth-authorize-requests.js';

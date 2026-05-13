export * from './users.js';
export * from './mcp-sessions.js';
export * from './auth-login-tokens.js';
export * from './api-keys.js';

// Better-auth tables (ADR-021 §3). See `auth-better.ts` for the
// bidirectional FK relationship with `users`.
export {
  authUser,
  authSession,
  authAccount,
  authVerification,
  type AuthUser,
  type AuthSession,
  type AuthAccount,
  type AuthVerification,
} from './auth-better.js';

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

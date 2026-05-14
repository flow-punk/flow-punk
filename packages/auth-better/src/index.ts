export {
  createAuthHandler,
  createAuthInstance,
  listEnabledProviders,
  type CreateAuthHandlerInput,
  type AuthHandler,
} from "./handler.js";
export {
  validateDashboardSession,
  type DashboardSessionIdentity,
  type ValidateDashboardSessionInput,
} from "./validate-session.js";
export {
  mintSessionForUser,
  MintIdentityUnresolvedError,
  type MintSessionInput,
  type MintSessionResult,
} from "./mint-session.js";
export {
  indieDefaultConfig,
  type AuthFactoryConfig,
  type IndieAuthConfigInput,
  type SocialProviderConfig,
} from "./config/index.js";
export * from "./schema/index.js";

export {
  extractAuthMaterial,
  OAUTH_TOKEN_PREFIX,
  API_KEY_PREFIX,
} from './extract-material.js';
export type { AuthMaterial } from './extract-material.js';
export {
  enforceRestScope,
  hasMcpAccess,
  hasScope,
  hasToolExecutionScope,
  isValidApiKeyScope,
  requiredScopeFor,
} from './scope.js';
export type { CredentialScopeType, RequiredScope } from './scope.js';
export { sha256Hex } from './sha256.js';
export { validateApiKey } from './validate-apikey.js';
export type { ValidatedIdentity } from './validate-apikey.js';
export {
  stripIdentityHeaders,
  stripIdentityHeadersFromRequest,
  withIdentityHeaders,
} from './identity-headers.js';
export type { IdentityHeaderValues } from './identity-headers.js';
export { unauthorized } from './unauthorized.js';
export type { UnauthorizedOptions } from './unauthorized.js';
export { authMiddleware } from '../middleware/auth.js';

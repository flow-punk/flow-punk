export type {
  AuthProviderDescriptor,
  Session,
  SessionUser,
} from "./types.js";
export { ApiOriginProvider, useApiOrigin } from "./api-origin.js";
export { useSession, SESSION_QUERY_KEY } from "./use-session.js";
export type { UseSessionResult } from "./use-session.js";
export { useProviders } from "./use-providers.js";
export type { UseProvidersResult } from "./use-providers.js";
export { SignInScreen } from "./SignInScreen.js";
export type { SignInScreenProps } from "./SignInScreen.js";
export {
  ForgotPasswordScreen,
  ResetPasswordConfirmScreen,
} from "./ResetPasswordScreens.js";
export {
  getSession,
  listProviders,
  signInWithEmail,
  signUpWithEmail,
  signInWithSocial,
  signOut,
  requestPasswordReset,
  resetPassword,
  changePassword,
  listSessions,
  revokeSession,
  signOutEverywhere,
  SignInError,
} from "./api.js";
export type {
  BetterAuthSession,
  BetterAuthSessionRow,
  BetterAuthUser,
  ChangePasswordInput,
  GetSessionResponse,
  ProvidersResponse,
  SignInEmailInput,
  SignInResponse,
  SignUpEmailInput,
} from "./api.js";

// Better-auth's tables live in `@flowpunk-indie/db` (one source of truth
// for SQL schema + migrations per ADR-001 + ADR-021 §3). Re-exported here
// so consumers that import via `@flowpunk-indie/auth-better/schema` get
// the same objects.
export {
  authUser,
  authSession,
  authAccount,
  authVerification,
  type AuthUser,
  type AuthSession,
  type AuthAccount,
  type AuthVerification,
} from '@flowpunk-indie/db';

import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * Better-auth's required tables (ADR-021 §3). Shapes match better-auth's
 * default `user` / `session` / `account` / `verification` exactly — we do
 * NOT remap field names through the adapter because that pegs our domain
 * schema to better-auth's release cadence (ADR-021 §3 rationale).
 *
 * Bidirectional FK to the domain `users` table:
 *   - `auth_user.domain_user_id` → `users.id` (additional field;
 *     populated by the sign-up transaction in `auth-better`'s handler).
 *   - `users.auth_user_id`       → `auth_user.id` (declared on the domain
 *     `users` table; see `schema/users.ts`).
 *
 * Either column resolves the other; both are nullable during the brief
 * window between create-better-auth-user and create-domain-user.
 *
 * Indie's single bound D1 and managed's per-tenant D1s both carry these
 * tables. The managed console's better-auth instance lives in the parent
 * D1 (per ADR-013) with its own copy of this schema, mirrored in
 * `managed/packages/db/` — see ADR-021 §2.
 */
export const authUser = sqliteTable(
  'auth_user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    emailVerified: integer('email_verified', { mode: 'boolean' })
      .notNull()
      .default(false),
    image: text('image'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    /** FK to our domain `users.id`. Populated post-signup. */
    domainUserId: text('domain_user_id'),
  },
  (t) => ({
    emailUnique: uniqueIndex('idx_auth_user_email_unique').on(t.email),
    domainUserIdUnique: uniqueIndex('idx_auth_user_domain_user_id_unique').on(
      t.domainUserId,
    ),
  }),
);

export const authSession = sqliteTable(
  'auth_session',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    token: text('token').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    tokenUnique: uniqueIndex('idx_auth_session_token_unique').on(t.token),
  }),
);

export const authAccount = sqliteTable('auth_account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => authUser.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', {
    mode: 'timestamp_ms',
  }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', {
    mode: 'timestamp_ms',
  }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const authVerification = sqliteTable('auth_verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export type AuthUser = typeof authUser.$inferSelect;
export type AuthSession = typeof authSession.$inferSelect;
export type AuthAccount = typeof authAccount.$inferSelect;
export type AuthVerification = typeof authVerification.$inferSelect;

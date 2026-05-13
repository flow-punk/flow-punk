/**
 * Indie default config — email/password only, email verification required.
 * ADR-021 §4 documents this as the "L1" swap surface: enabling Google or
 * Apple is one config-file edit + env vars; no code changes.
 */
import type { AuthFactoryConfig } from './types.js';

export interface IndieAuthConfigInput {
  publicOrigin: string;
  secret: string;
  cookieDomain?: string;
}

export function indieDefaultConfig(
  input: IndieAuthConfigInput,
): AuthFactoryConfig {
  return {
    emailPassword: {
      enabled: true,
      requireEmailVerification: true,
    },
    publicOrigin: input.publicOrigin,
    cookieDomain: input.cookieDomain,
    secret: input.secret,
  };
}

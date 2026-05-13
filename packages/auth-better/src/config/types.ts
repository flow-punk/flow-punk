/**
 * Better-auth provider config used by the factory. Each edition's wrapper
 * service composes one of these and passes it into `createAuthHandler`.
 *
 * Indie's default: `emailPassword.enabled = true; requireEmailVerification = true`;
 * no social providers.
 *
 * Managed: indie default + `socialProviders.google` + `socialProviders.apple`.
 *
 * Per ADR-021 §4 the UI reads the enabled-provider list from the server at
 * runtime (`GET /api/auth/providers`); the UI never knows what providers
 * exist, only what the server config exposes.
 */
export interface SocialProviderConfig {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
}

export interface AuthFactoryConfig {
  emailPassword: {
    enabled: boolean;
    requireEmailVerification: boolean;
  };
  socialProviders?: {
    google?: SocialProviderConfig;
    apple?: SocialProviderConfig & { teamId: string; keyId: string };
  };
  /** Public origin the dashboard runs at, used for callback URLs. */
  publicOrigin: string;
  /** Cookie-domain hint (host-scoped if omitted). */
  cookieDomain?: string;
  /** Secret used for session signing. Bound from `AUTH_SECRET` env. */
  secret: string;
}

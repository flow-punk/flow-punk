# `@flowpunk/auth` — indie auth worker

Two concerns coexist in this worker (ADR-021 §7):

| Path prefix | Concern | Library |
| --- | --- | --- |
| `/api/auth/*` | Dashboard human auth (sign-in / sign-up / OAuth / sessions) | `@flowpunk-indie/auth-better` (better-auth) |
| `/api/v1/auth/keys/*` + `/auth/validate` | Machine credentials (`fpk_*` API keys) | `@flowpunk-indie/auth-core` |
| `/auth/session-identity` | Gateway-internal session validator (Phase 1.2) | `@flowpunk-indie/auth-better` |

Both surfaces share `env.DB` (the single bound indie D1) and `env.AUTH_SECRET`. Cross-class routing happens by path prefix; there is no runtime edition branching.

## Adding a sign-in provider

By default indie ships email/password only. The fastest way to add Google is one edit + two env vars:

```diff
 // indie/services/auth/src/index.ts
 function resolveConfig(env: IndieAuthBetterEnv): AuthFactoryConfig {
   if (cachedConfig) return cachedConfig;
-  cachedConfig = indieDefaultConfig({
+  const base = indieDefaultConfig({
     publicOrigin: env.GATEWAY_PUBLIC_ORIGIN || 'http://localhost:3000',
     secret: env.AUTH_SECRET,
   });
+  cachedConfig = {
+    ...base,
+    socialProviders: {
+      google: {
+        enabled: true,
+        clientId: env.GOOGLE_CLIENT_ID,
+        clientSecret: env.GOOGLE_CLIENT_SECRET,
+      },
+    },
+  };
   return cachedConfig;
 }
```

Then:

```bash
wrangler secret put GOOGLE_CLIENT_ID --name auth
wrangler secret put GOOGLE_CLIENT_SECRET --name auth
```

Configure your Google OAuth consent screen with the callback URL:

```
${GATEWAY_PUBLIC_ORIGIN}/api/auth/callback/google
```

That's it. The dashboard discovers the new provider via `GET /api/auth/providers` and renders the "Continue with Google" button automatically — no UI change needed (ADR-021 §4).

The same one-file diff works for `apple` (set `clientId`, `clientSecret`, `teamId`, `keyId`). For other better-auth-supported providers (`github`, `microsoft`, `discord`, …), extend `AuthFactoryConfig['socialProviders']` in `indie/packages/auth-better/src/config/types.ts` first to surface a typed slot, then patch your config the same way.

See `managed/docs/services/auth.md` §"Customizing indie sign-in" for the L2 (plugins) and L3 (replace the package) paths.

## Local dev

```bash
pnpm -F @flowpunk/auth dev
```

Runs the worker at the port allocated in `managed/docs/development/local-ports.md` (auth range). Use the gateway at `http://localhost:8787` as the public entry; AUTH_SERVICE is a service binding and is not directly reachable.

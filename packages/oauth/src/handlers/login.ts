import { drizzle } from "drizzle-orm/d1";
import { authLoginTokensRepo, mcpSessionsRepo } from "@flowpunk-indie/db";
import {
  isExpired,
  isoNow,
  isoSecondsFromNow,
  randomBase64Url,
  randomOpaqueId,
  sha256Hex,
} from "@flowpunk-indie/oauth-protocol";

import type { OAuthEnv } from "../env.js";
import { OAUTH_ACTOR } from "../policy.js";
import { safeFormUrlEncoded } from "../body.js";
import { getIssuerOrigin } from "../origin.js";
import { oauthJsonError } from "../responses.js";
import { isApproveOriginAllowed } from "./approve.js";
import { validateReturnTo } from "../return-to.js";
import { buildCookie } from "../_lib/cookies.js";
import { loginPage } from "../login-form.js";

/**
 * Per ADR-019 amendment 2026-05-06. Session cookie matches the indie
 * encoding `<scope>.<payload>` (scope is the `_system` sentinel for
 * indie's single-tenant model; matches what `seedAdmin.ts` originally
 * produced and what `validateSession` expects).
 */
const SESSION_TENANT_SCOPE = "_system";
const SESSION_COOKIE_NAME = "fp_session";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

/** GET /auth/login — render the paste-token form. */
export function handleLoginPage(
  request: Request,
  _env: OAuthEnv,
  requestId: string,
): Response {
  const url = new URL(request.url);
  const returnTo = url.searchParams.get("return_to");
  const error = url.searchParams.get("error");

  // We don't validate `return_to` for shape here — the form just round-trips
  // it as a hidden input, and the POST handler validates it before
  // redirecting. Validating here would force us to drop a legitimate value
  // on a tighter ruleset than the POST. The HTML template escapes the value.
  return loginPage({
    returnTo,
    showError: error === "invalid_token",
    responseRequestId: requestId,
  });
}

/** POST /auth/login — consume a connect token and Set-Cookie a fresh session. */
export async function handleLoginSubmit(
  request: Request,
  env: OAuthEnv,
  requestId: string,
): Promise<Response> {
  let issuerOrigin: string;
  try {
    issuerOrigin = getIssuerOrigin(env, request);
  } catch {
    return oauthJsonError(500, "server_error");
  }

  // Same-origin attestation (Chrome, Firefox, Safari, Origin: null +
  // Sec-Fetch-Site: same-origin all handled by the shared helper).
  if (!isApproveOriginAllowed(request, issuerOrigin)) {
    return oauthJsonError(400, "invalid_request");
  }

  const form = await safeFormUrlEncoded(request, env, requestId);
  if (form instanceof Response) return form;
  if (!form) return oauthJsonError(400, "invalid_request");

  const token = form.get("token");
  const returnToRaw = form.get("return_to");
  if (typeof token !== "string" || token.length === 0) {
    return oauthJsonError(400, "invalid_request");
  }
  const returnTo = typeof returnToRaw === "string" ? returnToRaw : null;

  const db = drizzle(env.DB);

  // Look up by hash. Reject ANY of: not found, expired, already consumed.
  // All three failure modes surface as the same `invalid_token` redirect
  // so an attacker can't distinguish "token never existed" from "stale".
  const tokenHash = await sha256Hex(token);
  const row = await authLoginTokensRepo.findByHash(db, tokenHash);
  if (!row || row.consumedAt !== null || isExpired(row.expiresAt)) {
    return rejectInvalid(returnTo, requestId);
  }

  // Atomic single-shot consume — fails safely if another concurrent request
  // beat us to it.
  const now = isoNow();
  const consumed = await authLoginTokensRepo.consume(db, row.id, now);
  if (!consumed) {
    return rejectInvalid(returnTo, requestId);
  }

  // Mint a fresh long-lived session row. `cookieValue` is server-generated
  // and never traverses the operator's terminal — it lives only in this
  // function's stack frame and the resulting Set-Cookie header.
  const sessionPayload = randomBase64Url(32);
  const cookieValue = `${SESSION_TENANT_SCOPE}.${sessionPayload}`;
  const cookieHash = await sha256Hex(cookieValue);
  const sessionId = randomOpaqueId();
  const expiresAt = isoSecondsFromNow(SESSION_TTL_SECONDS);
  await mcpSessionsRepo.insert(db, {
    id: sessionId,
    cookieHash,
    userId: row.userId,
    expiresAt,
    revokedAt: null,
    createdAt: now,
    createdBy: OAUTH_ACTOR,
    updatedAt: now,
    updatedBy: OAUTH_ACTOR,
  });

  // Validate return_to before we redirect. If invalid, fall back to the
  // gateway origin — never propagate operator-controlled URLs verbatim.
  const validated = validateReturnTo(returnTo, issuerOrigin);
  const target = validated.ok ? validated.url : issuerOrigin;

  return new Response(null, {
    status: 302,
    headers: {
      Location: target,
      "Set-Cookie": buildCookie(SESSION_COOKIE_NAME, cookieValue, {
        httpOnly: true,
        secure: true,
        sameSite: "Strict",
        path: "/",
        maxAge: SESSION_TTL_SECONDS,
      }),
      "Cache-Control": "no-store",
      "X-Request-ID": requestId,
    },
  });
}

function rejectInvalid(returnTo: string | null, requestId: string): Response {
  // Redirect back to GET form with the error banner. Carries `return_to`
  // through so the operator doesn't lose context across retries. We do
  // NOT echo the submitted token in any form.
  const params = new URLSearchParams();
  params.set("error", "invalid_token");
  if (returnTo) params.set("return_to", returnTo);
  return new Response(null, {
    status: 302,
    headers: {
      Location: `/auth/login?${params.toString()}`,
      "Cache-Control": "no-store",
      "X-Request-ID": requestId,
    },
  });
}

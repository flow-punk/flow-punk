import type { AppContext, Middleware } from "../types.js";
import { handleMcp } from "../mcp/index.js";
import { handleDocs, handleOpenApi } from "../openapi/handler.js";
import { handleRest } from "../rest/handler.js";
import { route as oauthRoute } from "@flowpunk-indie/oauth";
import { validateSession } from "../auth/validate-session.js";

/**
 * Pure indie route dispatcher shared by indie's own router middleware and
 * managed's wrapper router.
 *
 * Dispatches to the appropriate handler based on path:
 *   - /health → health check response
 *   - /.well-known/oauth-* → OAuth discovery metadata (RFC 9728/8414)
 *   - /oauth/* → OAuth 2.1 endpoints (per ADR-019)
 *   - /mcp → MCP handler
 *   - /api/v1/* → REST handler
 *   - /openapi.json, /docs → local-dev OpenAPI/Swagger UI (gated by
 *     OPENAPI_ENABLED, see ADR-014)
 *
 * Routing only dispatches; it does not own request-body enforcement.
 */
export async function dispatchIndieRoute(ctx: AppContext): Promise<Response> {
  const { pathname } = new URL(ctx.request.url);

  if (pathname === "/health") {
    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // OAuth discovery + endpoints. /oauth/authorize and /oauth/approve both
  // need the user's session for the indie bootstrap flow (per ADR-019
  // amendment 2026-05-06): /oauth/authorize redirects unauthenticated
  // browsers to /auth/login, and /oauth/approve fails closed with 401 as
  // defense in depth. All other OAuth paths receive null.
  //
  // PRM lookup: per RFC 9728 §3.1, when the protected resource URI has a
  // path component, clients construct the metadata URL by inserting
  // `/.well-known/oauth-protected-resource` BEFORE that path. Our
  // resource is `<origin>/mcp` (per ADR-019 amendment 2026-05-06b), so
  // Anthropic and other compliant MCP clients fetch the metadata at
  // `/.well-known/oauth-protected-resource/mcp` — NOT the bare suffix.
  // Match anything under `/.well-known/oauth-protected-resource` so both
  // shapes resolve to the same handler.
  if (
    pathname.startsWith("/oauth/") ||
    pathname === "/.well-known/oauth-protected-resource" ||
    pathname.startsWith("/.well-known/oauth-protected-resource/") ||
    pathname === "/.well-known/oauth-authorization-server"
  ) {
    let session: { userId: string } | null = null;
    if (pathname === "/oauth/authorize" || pathname === "/oauth/approve") {
      const validated = await validateSession(ctx.env, ctx.request);
      if (validated) session = { userId: validated.userId };
    }
    return oauthRoute(ctx.request, ctx.env, {
      requestId: ctx.requestId,
      session,
    });
  }

  if (ctx.env.OPENAPI_ENABLED === "1") {
    if (pathname === "/api/openapi.json") return handleOpenApi();
    if (pathname === "/api/docs") return handleDocs();
  }

  if (pathname === "/mcp") return handleMcp(ctx);
  if (pathname.startsWith("/api/v1/")) return handleRest(ctx);

  return new Response("Not Found", { status: 404 });
}

/**
 * Router middleware (final in the chain).
 */
export const routerMiddleware: Middleware = async (
  ctx: AppContext,
  _next: () => Promise<Response>,
): Promise<Response> => dispatchIndieRoute(ctx);

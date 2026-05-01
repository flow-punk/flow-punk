import { createLogger } from '@flowpunk/service-utils';
import type { CredentialDescriptor, Logger } from '@flowpunk/service-utils';
import { buildToolRegistry, createMcpToolAdapter } from '@flowpunk/tool-registry';
import type {
  Edition,
  McpServiceName,
  McpToolAdapter,
  McpToolState,
  ToolMetadata,
  ToolRegistry,
} from '@flowpunk/tool-registry';
import { copyIdentityHeaders, extractIdentityHeaders } from '../auth/identity-headers.js';
import {
  BodyTooLargeError,
  declaredContentLengthTooLarge,
  invalidBodyLimitResponse,
  parseMaxBodyBytes,
  readRequestTextWithinLimit,
  readResponseBytesWithinLimit,
  requestTooLargeResponse,
} from '../body-size.js';
import { fetchWithServiceTimeout } from '../fetch-with-timeout.js';
import { hasToolExecutionScope, type CredentialScopeType } from '../auth/scope.js';
import type { AppContext, Env } from '../types.js';
import type { CredentialType } from '../auth/identity-headers.js';

/**
 * Narrow the wider trusted `CredentialType` to the MCP-accepted subset.
 * Sessions are admin-REST-only and must never reach MCP — `validateMcpSessionIdentity`
 * already rejects them at the entry point; this helper makes the narrowing
 * type-safe for downstream MCP-only consumers.
 */
function narrowMcpCredentialType(
  type: CredentialType | undefined,
): CredentialScopeType | undefined {
  return type === 'session' ? undefined : type;
}
import type { SessionState } from './session-do.js';

export const SESSION_HEADER = 'X-MCP-Session-Id';
export const SESSION_MODE_HEADER = 'X-MCP-Session-Mode';
export const IDEMPOTENCY_KEY_HEADER = 'X-Idempotency-Key';
export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
} as const;

const JSONRPC_VERSION = '2.0';
const SUPPORTED_PROTOCOL_VERSION = '2025-03-26';
const SERVER_NAME = 'flowpunk-gateway';
const SERVER_VERSION = '0.1.0';
const TOOLS_CACHE_TTL_SECONDS = 300;
const REQUEST_ID_HEADER = 'X-Request-ID';
export const INVALIDATE_TOOLS_HEADER = 'X-FlowPunk-MCP-Invalidate-Tools';
export const INVALIDATE_TOOLS_REASON_HEADER = 'X-FlowPunk-MCP-Invalidate-Tools-Reason';

export const SESSION_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const SESSION_ID_PATTERN = /^mcp_sess_[A-Za-z0-9_-]{22}$/;

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc: string;
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

interface JsonRpcSuccess {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result: unknown;
}

interface JsonRpcError {
  jsonrpc: '2.0';
  id: JsonRpcId;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface SessionIdentity {
  tenantId: string;
  userId: string;
  credentialId: string;
  credentialType: 'apikey' | 'oauth';
  scope: string;
}

interface DownstreamToolsResponse {
  toolState: McpToolState;
}

type CachedToolState =
  | {
    mode: 'dynamic';
    toolState: McpToolState;
    /**
     * Services whose `GET /mcp/tools` actually succeeded when the cache
     * was written. The hybrid adapter uses this (∩ current adoption set)
     * to decide which services contribute dynamic state vs static fallback —
     * a partial fan-out where pipeline failed must NOT cause pipeline tools
     * to disappear; static fallback fills in for adopted-but-failed.
     */
    succeededServices: string[];
    /**
     * The adoption set in effect at cache write time. If the gateway is
     * redeployed with a different `MCP_TOOLS_DYNAMIC_SERVICES`, cached
     * entries are ignored (treated as stale) so newly-adopted services
     * are queried immediately rather than waiting for TTL.
     */
    adoptionSet: string[];
  }
  | {
    mode: 'fallback';
  };

/**
 * MCP front controller.
 * Routes every session-bound request to the Durable Object responsible for that
 * MCP session. JSON-RPC execution happens inside the DO after session
 * ownership and expiry checks.
 */
export async function handleMcp(ctx: AppContext): Promise<Response> {
  const identity = validateMcpSessionIdentity(extractIdentityHeaders(ctx.request.headers));
  if (!identity) {
    return new Response(
      JSON.stringify({ error: 'unauthorized' }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          [REQUEST_ID_HEADER]: ctx.requestId,
        },
      },
    );
  }

  const suppliedSessionId = getSessionId(ctx.request);
  if (suppliedSessionId && !isValidSessionId(suppliedSessionId)) {
    return new Response(
      JSON.stringify({ error: 'invalid_session_id' }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          [REQUEST_ID_HEADER]: ctx.requestId,
        },
      },
    );
  }

  const sessionId = ctx.request.method === 'GET'
    ? (suppliedSessionId ?? generateSessionId())
    : suppliedSessionId;
  const sessionMode = ctx.request.method === 'GET'
    ? (suppliedSessionId ? 'reattach' : 'create')
    : 'existing';

  if (!sessionId) {
    return new Response(
      JSON.stringify({ error: 'missing_session_id' }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          [REQUEST_ID_HEADER]: ctx.requestId,
        },
      },
    );
  }

  const stub = ctx.env.MCP_SESSION_DO.get(
    ctx.env.MCP_SESSION_DO.idFromName(sessionId),
  );
  const headers = buildSessionForwardHeaders(ctx, sessionId, sessionMode);
  const request = new Request('http://internal/mcp/session', {
    method: ctx.request.method,
    headers,
    body: ctx.request.method === 'POST' ? ctx.request.body : undefined,
  });

  return stub.fetch(request);
}

export function createJsonRpcContext(
  request: Request,
  env: Env,
  requestId: string,
  session: SessionState,
): AppContext {
  return {
    request,
    env,
    requestId,
    tenantId: session.tenantId,
    userId: session.userId,
    credentialId: session.credentialId,
    credentialType: session.credentialType,
    scope: request.headers.get('X-Scope') ?? '',
  };
}

export async function executeJsonRpc(
  ctx: AppContext,
  session: SessionState,
): Promise<Response> {
  const maxBytes = parseMaxBodyBytes(ctx.env.MAX_REQUEST_BODY_BYTES);
  if (maxBytes === null) return invalidBodyLimitResponse(ctx.requestId);
  if (declaredContentLengthTooLarge(ctx.request.headers, maxBytes)) {
    return requestTooLargeResponse(maxBytes, ctx.requestId);
  }

  const parsed = await parseJsonRpcRequest(ctx.request, maxBytes);
  if (!parsed.ok) {
    const response = parsed.message === 'Request too large'
      ? requestTooLargeResponse(maxBytes, ctx.requestId)
      : jsonRpcResponse(errorPayload(null, -32700, parsed.message), 400, ctx.requestId);
    return response;
  }

  const request = parsed.request;
  if (!isValidJsonRpcRequest(request)) {
    return jsonRpcResponse(
      errorPayload(jsonRpcIdFromUnknown(request), -32600, 'Invalid Request'),
      400,
      ctx.requestId,
    );
  }

  let payload: JsonRpcSuccess | JsonRpcError;
  let status = 200;

  try {
    switch (request.method) {
      case 'initialize':
        payload = initializePayload(request.id ?? null, request.params, session.sessionId);
        if ('error' in payload) status = 400;
        break;
      case 'tools/list':
        payload = successPayload(request.id ?? null, {
          tools: await listAvailableTools(ctx, maxBytes),
        });
        break;
      case 'tools/call':
        payload = await handleToolCall(ctx, session, request, maxBytes);
        break;
      default:
        payload = errorPayload(
          request.id ?? null,
          -32601,
          `Method not found: ${request.method}`,
        );
        status = 404;
    }
  } catch (error) {
    bindLogger(ctx).error('mcp_request_failed', {
      method: request.method,
      sessionId: session.sessionId,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : 'unknown error',
    });
    payload = errorPayload(request.id ?? null, -32603, 'Internal error');
    status = 500;
  }

  return jsonRpcResponse(payload, status, ctx.requestId);
}

async function handleToolCall(
  ctx: AppContext,
  session: SessionState,
  request: JsonRpcRequest,
  maxBytes: number,
): Promise<JsonRpcSuccess | JsonRpcError> {
  const params = request.params;
  if (!isToolCallParams(params)) {
    return errorPayload(request.id ?? null, -32602, 'Invalid tool call params');
  }

  const toolName = params.name;
  const { adapter } = await resolveGatewayToolAdapter(ctx, maxBytes);
  const toolMetadata = adapter.getToolMetadata(toolName);
  if (!toolMetadata) {
    return errorPayload(request.id ?? null, -32601, `Unknown tool: ${toolName}`);
  }

  const requiredScope = adapter.requiredScopeForTool(toolName);
  if (!hasToolExecutionScope(narrowMcpCredentialType(ctx.credentialType), ctx.scope, requiredScope)) {
    return errorPayload(request.id ?? null, -32003, 'Insufficient scope', {
      requiredScope,
    });
  }

  if (toolName === 'tools_search') {
    const query = toolSearchQuery(params.arguments);
    if (query === null) {
      return errorPayload(request.id ?? null, -32602, 'Invalid tools_search query');
    }

    return successPayload(request.id ?? null, {
      results: adapter.searchTools(query),
    });
  }

  if (toolMetadata.availability.status !== 'available' && toolMetadata.kind !== 'domain') {
    return errorPayload(request.id ?? null, -32004, 'Tool is not available for this tenant', {
      reason: toolMetadata.availability.reason,
      nextStep: toolMetadata.availability.nextStep,
    });
  }

  if (isDomainExpandCall(toolMetadata, params.arguments)) {
    if (!toolMetadata.tools) {
      return errorPayload(request.id ?? null, -32601, `Unknown tool: ${toolName}`);
    }

    return successPayload(request.id ?? null, {
      tools: toolMetadata.tools.map(toToolDefinition),
    });
  }

  if (toolMetadata.kind === 'domain') {
    return errorPayload(
      request.id ?? null,
      -32602,
      `Domain tool ${toolName} requires action="expand"`,
    );
  }

  const service = bindingForTool(toolMetadata.service, ctx);
  if (!service) {
    return errorPayload(
      request.id ?? null,
      -32601,
      `Tool is not executable in this scope: ${toolName}`,
    );
  }

  // Mutating tools require a JSON-RPC `id` so we can synthesize a stable
  // X-Idempotency-Key for downstream `withIdempotency`. Without an id, MCP
  // notifications would replay against `withIdempotency` with no dedup key
  // and writes could double-execute on retry.
  if (
    requiredScope === 'write' &&
    (request.id === undefined || request.id === null)
  ) {
    return errorPayload(
      null,
      -32602,
      `Mutating tool ${toolName} requires a JSON-RPC id for idempotent dispatch`,
    );
  }

  const headers = buildDownstreamServiceHeaders(ctx.request.headers, ctx.requestId, session.sessionId);

  if (requiredScope === 'write') {
    headers.set(
      IDEMPOTENCY_KEY_HEADER,
      await synthesizeIdempotencyKey(session.sessionId, request.id ?? null, toolName),
    );
  }

  let response: Response;
  try {
    response = await fetchWithServiceTimeout(
      service,
      'http://internal/mcp/execute',
      {
        method: 'POST',
        headers,
        // Body is the stable retry-identity payload — must not contain any
        // per-HTTP-request entropy. `withIdempotency` hashes the body to
        // detect "same key, different request" replays; a volatile field
        // here would 422 every legitimate retry. The HTTP request id lives
        // in the `X-Request-ID` header (set by buildDownstreamServiceHeaders).
        body: JSON.stringify({
          sessionId: session.sessionId,
          name: toolName,
          arguments: params.arguments ?? {},
          jsonrpcId: request.id ?? null,
        }),
      },
      ctx.env.SERVICE_TIMEOUT_MS,
    );
  } catch (error) {
    bindLogger(ctx).error('mcp_tool_dispatch_failed', {
      toolName,
      sessionId: session.sessionId,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : 'unknown error',
    });
    return errorPayload(request.id ?? null, -32010, 'Tool dispatch failed');
  }

  let responseBody: unknown;
  try {
    responseBody = await parseDownstreamBody(response, maxBytes);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      bindLogger(ctx).warn('mcp_tool_response_too_large', {
        toolName,
        sessionId: session.sessionId,
        maxBytes,
      });
      return errorPayload(request.id ?? null, -32011, 'Tool execution failed', {
        status: response.status,
        body: { error: 'response_too_large', maxBytes },
      });
    }
    throw error;
  }

  await invalidateToolsCacheIfRequired(response.headers, ctx);

  if (!response.ok) {
    bindLogger(ctx).warn('mcp_tool_dispatch_rejected', {
      toolName,
      sessionId: session.sessionId,
      statusCode: response.status,
    });
    return errorPayload(request.id ?? null, -32011, 'Tool execution failed', {
      status: response.status,
      body: responseBody,
    });
  }

  return successPayload(request.id ?? null, responseBody);
}

async function listAvailableTools(
  ctx: AppContext,
  maxBytes: number,
): Promise<Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>> {
  const { adapter } = await resolveGatewayToolAdapter(ctx, maxBytes);
  return adapter.listAvailableTools().map(toToolDefinition);
}

export async function invalidateToolsCacheIfRequired(
  responseHeaders: Headers,
  ctx: AppContext,
): Promise<void> {
  const invalidation = downstreamToolsInvalidationFromHeaders(responseHeaders);
  if (!ctx.tenantId || !invalidation.invalidateTools) {
    return;
  }

  try {
    await ctx.env.MCP_TOOLS_KV.delete(`mcp:tools:${ctx.tenantId}`);
    bindLogger(ctx).info('mcp_tools_cache_invalidated', {
      tenantId: ctx.tenantId,
      reason: invalidation.reason,
      ttlSeconds: TOOLS_CACHE_TTL_SECONDS,
    });
  } catch (error) {
    bindLogger(ctx).warn('mcp_tools_cache_invalidation_failed', {
      tenantId: ctx.tenantId,
      reason: invalidation.reason,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : 'unknown error',
    });
  }
}

function downstreamToolsInvalidationFromHeaders(
  headers: Headers,
): {
  invalidateTools: boolean;
  reason?: string;
} {
  const invalidateTools = headers.get(INVALIDATE_TOOLS_HEADER) === 'true';
  const reason = headers.get(INVALIDATE_TOOLS_REASON_HEADER) ?? undefined;
  return {
    invalidateTools,
    reason,
  };
}

function buildSessionForwardHeaders(
  ctx: AppContext,
  sessionId: string,
  sessionMode: 'create' | 'reattach' | 'existing',
): Headers {
  const headers = new Headers();
  copyIdentityHeaders(ctx.request.headers, headers);
  headers.set(REQUEST_ID_HEADER, ctx.requestId);
  headers.set(SESSION_HEADER, sessionId);
  headers.set(SESSION_MODE_HEADER, sessionMode);

  const contentType = ctx.request.headers.get('Content-Type');
  if (contentType) headers.set('Content-Type', contentType);
  return headers;
}

function buildDownstreamServiceHeaders(
  sourceHeaders: Headers,
  requestId: string,
  sessionId?: string,
): Headers {
  const headers = new Headers();
  copyIdentityHeaders(sourceHeaders, headers);
  headers.set('Content-Type', 'application/json');
  headers.set(REQUEST_ID_HEADER, requestId);
  if (sessionId) headers.set(SESSION_HEADER, sessionId);
  return headers;
}

export function getSessionId(request: Request): string | null {
  const headerValue = request.headers.get(SESSION_HEADER);
  if (headerValue && headerValue.trim() !== '') return headerValue.trim();

  const queryValue = new URL(request.url).searchParams.get('sessionId');
  if (queryValue && queryValue.trim() !== '') return queryValue.trim();

  return null;
}

export function isValidSessionId(sessionId: string): boolean {
  return SESSION_ID_PATTERN.test(sessionId);
}

export function validateMcpSessionIdentity(
  identity: ReturnType<typeof extractIdentityHeaders>,
): SessionIdentity | null {
  if (
    !identity ||
    !identity.tenantId ||
    !identity.userId ||
    !identity.scope ||
    !identity.credentialId
  ) {
    return null;
  }

  // Sessions are admin-REST-only, never valid for MCP. Path scoping in the
  // gateway auth middleware should prevent stamping `'session'` on `/mcp`,
  // but reject here as defense in depth (ADR-011 §MCP auth).
  if (identity.credentialType === 'session') {
    return null;
  }

  return {
    tenantId: identity.tenantId,
    userId: identity.userId,
    credentialId: identity.credentialId,
    credentialType: identity.credentialType,
    scope: identity.scope,
  };
}

function bindingForTool(service: McpServiceName, ctx: AppContext): Fetcher | null {
  switch (service) {
    case 'contacts':
      return ctx.env.CONTACTS_SERVICE;
    case 'pipeline':
      return ctx.env.PIPELINE_SERVICE;
    case 'gateway':
      return null;
  }
}

async function parseJsonRpcRequest(
  request: Request,
  maxBytes: number,
): Promise<
  | { ok: true; request: unknown }
  | { ok: false; message: string }
> {
  try {
    const body = await readRequestTextWithinLimit(request, maxBytes);
    return { ok: true, request: JSON.parse(body) };
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return { ok: false, message: 'Request too large' };
    }
    return { ok: false, message: 'Parse error' };
  }
}

function isValidJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<JsonRpcRequest>;
  return candidate.jsonrpc === JSONRPC_VERSION && typeof candidate.method === 'string';
}

function jsonRpcIdFromUnknown(value: unknown): JsonRpcId {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { id?: unknown };
  if (
    typeof candidate.id === 'string' ||
    typeof candidate.id === 'number' ||
    candidate.id === null
  ) {
    return candidate.id;
  }
  return null;
}

function initializePayload(
  id: JsonRpcId,
  params: unknown,
  sessionId: string,
): JsonRpcSuccess | JsonRpcError {
  const requestedVersion = protocolVersionFromInitializeParams(params);
  if (requestedVersion !== null && requestedVersion !== SUPPORTED_PROTOCOL_VERSION) {
    return errorPayload(id, -32602, `Unsupported protocol version: ${requestedVersion}`, {
      supportedProtocolVersions: [SUPPORTED_PROTOCOL_VERSION],
    });
  }

  return successPayload(id, {
    protocolVersion: requestedVersion ?? SUPPORTED_PROTOCOL_VERSION,
    serverInfo: {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    capabilities: {
      tools: {
        listChanged: false,
      },
    },
    sessionId,
  });
}

function protocolVersionFromInitializeParams(params: unknown): string | null {
  if (!params || typeof params !== 'object') return null;
  const protocolVersion = (params as { protocolVersion?: unknown }).protocolVersion;
  return typeof protocolVersion === 'string' ? protocolVersion : null;
}

function isToolCallParams(
  value: unknown,
): value is { name: string; arguments?: Record<string, unknown> } {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as {
    name?: unknown;
    arguments?: unknown;
  };
  if (typeof candidate.name !== 'string') return false;
  if (
    candidate.arguments !== undefined &&
    (candidate.arguments === null ||
      typeof candidate.arguments !== 'object' ||
      Array.isArray(candidate.arguments))
  ) {
    return false;
  }

  return true;
}

function isDomainExpandCall(
  toolMetadata: ToolMetadata,
  args: Record<string, unknown> | undefined,
): boolean {
  if (toolMetadata.kind !== 'domain') return false;
  return args?.action === 'expand';
}

function toolSearchQuery(args: Record<string, unknown> | undefined): string | null {
  if (!args) return '';
  if (args.query === undefined) return '';
  return typeof args.query === 'string' ? args.query : null;
}

function successPayload(id: JsonRpcId, result: unknown): JsonRpcSuccess {
  return {
    jsonrpc: JSONRPC_VERSION,
    id,
    result,
  };
}

function errorPayload(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcError {
  return {
    jsonrpc: JSONRPC_VERSION,
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  };
}

function jsonRpcResponse(
  payload: JsonRpcSuccess | JsonRpcError,
  status: number,
  requestId: string,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

async function parseDownstreamBody(
  response: Response,
  maxBytes: number,
): Promise<unknown> {
  const bytes = await readResponseBytesWithinLimit(response, maxBytes);
  if (bytes.byteLength === 0) return null;

  const contentType = response.headers.get('Content-Type') ?? '';
  const text = new TextDecoder().decode(bytes);
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return { error: 'invalid_json_response' };
    }
  }

  return { text };
}

function bindLogger(ctx: AppContext): Logger {
  let logger = createLogger({ service: 'gateway' })
    .withRequestId(ctx.requestId)
    .withTenantId(ctx.tenantId)
    .withUserId(ctx.userId);
  if (ctx.credentialId && ctx.credentialType) {
    const descriptor: CredentialDescriptor = {
      credentialId: ctx.credentialId,
      credentialType: ctx.credentialType,
      ...(ctx.credentialType === 'apikey'
        ? { keyLabel: ctx.keyLabel ?? null }
        : {}),
    };
    logger = logger.withCredential(descriptor);
  }
  return logger;
}

function generateSessionId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `mcp_sess_${base64UrlEncode(bytes)}`;
}

/**
 * Stable per-call idempotency key derived from the MCP session, JSON-RPC
 * request id, and tool name. Identical retries (same session, same id,
 * same tool) collapse to a single side-effect via `withIdempotency` at
 * the service layer.
 *
 * The composite preserves the JSON-RPC id's type (string vs number) so
 * `id: 0` and `id: "0"` produce different keys — JSON.stringify of a typed
 * tuple is the canonical form. Full SHA-256 hex (no truncation) — `withIdempotency`
 * accepts up to 255 chars by default.
 */
async function synthesizeIdempotencyKey(
  sessionId: string,
  jsonrpcId: JsonRpcId,
  toolName: string,
): Promise<string> {
  const composite = JSON.stringify(['mcp', sessionId, typeof jsonrpcId, jsonrpcId, toolName]);
  const bytes = new TextEncoder().encode(composite);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `mcp_${hex}`;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * Per-worker registry. Each gateway wrapper sets `env.EDITION` in its
 * wrangler config — `'all'` for indie, `'managed'` for managed. Cached
 * here so we build it once per worker boot rather than per request.
 */
const REGISTRY_CACHE = new Map<Edition, ToolRegistry>();

function registryForEdition(edition: Edition): ToolRegistry {
  let cached = REGISTRY_CACHE.get(edition);
  if (!cached) {
    cached = buildToolRegistry(edition);
    REGISTRY_CACHE.set(edition, cached);
  }
  return cached;
}

function envEdition(env: Env): Edition {
  return env.EDITION === 'managed' ? 'managed' : 'all';
}

function parseDynamicServices(raw: string | undefined): Set<Exclude<McpServiceName, 'gateway'>> {
  const allowed = new Set<Exclude<McpServiceName, 'gateway'>>(['contacts', 'pipeline']);
  const out = new Set<Exclude<McpServiceName, 'gateway'>>();
  for (const part of (raw ?? '').split(',')) {
    const trimmed = part.trim();
    if (allowed.has(trimmed as Exclude<McpServiceName, 'gateway'>)) {
      out.add(trimmed as Exclude<McpServiceName, 'gateway'>);
    }
  }
  return out;
}

function createStaticGatewayToolAdapter(ctx: AppContext): McpToolAdapter {
  return createMcpToolAdapter(
    {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      scope: ctx.scope,
      credentialType: narrowMcpCredentialType(ctx.credentialType),
    },
    registryForEdition(envEdition(ctx.env)),
  );
}

/**
 * Hybrid adapter: dynamic state for adopted services + static fallback for
 * non-adopted services. The static catalog is excluded at adapter level
 * (`includeStaticCatalog: false`); we hand-pass non-adopted services'
 * static tools as `availableTools` so the merged set matches what the
 * tenant should see.
 */
function createHybridGatewayToolAdapter(
  ctx: AppContext,
  toolState: McpToolState,
  dynamicServices: Set<Exclude<McpServiceName, 'gateway'>>,
): McpToolAdapter {
  const registry = registryForEdition(envEdition(ctx.env));
  const staticForNonAdopted = registry.staticExecutableTools.filter(
    (tool) => !dynamicServices.has(tool.service as Exclude<McpServiceName, 'gateway'>),
  );
  return createMcpToolAdapter(
    {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      scope: ctx.scope,
      credentialType: narrowMcpCredentialType(ctx.credentialType),
      includeStaticCatalog: false,
      availableTools: [...toolState.availableTools, ...staticForNonAdopted],
      unavailableTools: toolState.unavailableTools,
      dynamicTools: toolState.dynamicTools,
    },
    registry,
  );
}

function toToolDefinition(tool: ToolMetadata): {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
} {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  };
}

async function resolveGatewayToolAdapter(
  ctx: AppContext,
  maxBytes: number,
): Promise<{ adapter: McpToolAdapter }> {
  if (!ctx.tenantId) {
    return {
      adapter: createStaticGatewayToolAdapter(ctx),
    };
  }

  const dynamicServices = parseDynamicServices(ctx.env.MCP_TOOLS_DYNAMIC_SERVICES);

  // No services adopted dynamic introspection → straight to static.
  if (dynamicServices.size === 0) {
    return { adapter: createStaticGatewayToolAdapter(ctx) };
  }

  const cachedState = await readCachedToolState(ctx, dynamicServices);
  if (cachedState) {
    if (cachedState.mode === 'fallback') {
      return { adapter: createStaticGatewayToolAdapter(ctx) };
    }
    // The set of services that contribute dynamic state is the
    // intersection of (succeeded-when-cached) ∩ (currently-adopted). All
    // other adopted services get static fallback so a single failed
    // service in a fan-out doesn't make its tools disappear.
    const effectivelyDynamic = intersect(
      new Set(cachedState.succeededServices as Array<Exclude<McpServiceName, 'gateway'>>),
      dynamicServices,
    );
    return {
      adapter: createHybridGatewayToolAdapter(ctx, cachedState.toolState, effectivelyDynamic),
    };
  }

  const fanOut = await fetchTenantToolState(ctx, maxBytes, dynamicServices);
  if (!fanOut) {
    // All adopted services failed introspection. Degrade to static for THIS
    // request (do not poison the cache with a fallback marker) so the next
    // request retries fan-out — service deploys recover quickly.
    bindLogger(ctx).warn('mcp_tools_introspection_failed', {
      tenantId: ctx.tenantId,
      adoptedServices: [...dynamicServices].sort(),
    });
    return { adapter: createStaticGatewayToolAdapter(ctx) };
  }

  await writeCachedToolState(ctx, {
    mode: 'dynamic',
    toolState: fanOut.toolState,
    succeededServices: [...fanOut.succeededServices].sort(),
    adoptionSet: [...dynamicServices].sort(),
  });
  return {
    adapter: createHybridGatewayToolAdapter(ctx, fanOut.toolState, fanOut.succeededServices),
  };
}

function intersect<T>(a: Set<T>, b: Set<T>): Set<T> {
  const out = new Set<T>();
  for (const value of a) if (b.has(value)) out.add(value);
  return out;
}

async function readCachedToolState(
  ctx: AppContext,
  currentAdoption: Set<Exclude<McpServiceName, 'gateway'>>,
): Promise<CachedToolState | null> {
  if (!ctx.tenantId) return null;

  try {
    const cached = await ctx.env.MCP_TOOLS_KV.get(toolsCacheKey(ctx.tenantId), 'json') as
      | CachedToolState
      | null;
    if (!isCachedToolState(cached)) return null;
    // Ignore cache when the adoption set has changed — otherwise newly
    // adopted services would be invisible until TTL expires.
    if (cached.mode === 'dynamic') {
      const cachedSig = cached.adoptionSet.join(',');
      const currentSig = [...currentAdoption].sort().join(',');
      if (cachedSig !== currentSig) return null;
    }
    return cached;
  } catch (error) {
    bindLogger(ctx).warn('mcp_tools_cache_read_failed', {
      tenantId: ctx.tenantId,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : 'unknown error',
    });
  }

  return null;
}

async function writeCachedToolState(ctx: AppContext, cachedState: CachedToolState): Promise<void> {
  if (!ctx.tenantId) return;

  try {
    await ctx.env.MCP_TOOLS_KV.put(toolsCacheKey(ctx.tenantId), JSON.stringify(cachedState), {
      expirationTtl: TOOLS_CACHE_TTL_SECONDS,
    });
  } catch (error) {
    bindLogger(ctx).warn('mcp_tools_cache_write_failed', {
      tenantId: ctx.tenantId,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : 'unknown error',
    });
  }
}

interface FanOutResult {
  toolState: McpToolState;
  succeededServices: Set<Exclude<McpServiceName, 'gateway'>>;
}

async function fetchTenantToolState(
  ctx: AppContext,
  maxBytes: number,
  dynamicServices: Set<Exclude<McpServiceName, 'gateway'>>,
): Promise<FanOutResult | null> {
  const allServices: Array<{
    name: Exclude<McpServiceName, 'gateway'>;
    binding: Fetcher;
  }> = [
    { name: 'contacts' as const, binding: ctx.env.CONTACTS_SERVICE },
    { name: 'pipeline' as const, binding: ctx.env.PIPELINE_SERVICE },
  ];
  const services = allServices.filter((entry) => dynamicServices.has(entry.name));
  if (services.length === 0) return null;

  const results = await Promise.allSettled(
    services.map(async ({ name, binding }) => ({
      name,
      response: await fetchDownstreamToolState(ctx, name, binding, maxBytes),
    })),
  );

  const mergedState = emptyToolState();
  const succeededServices = new Set<Exclude<McpServiceName, 'gateway'>>();

  for (const [index, result] of results.entries()) {
    if (result.status === 'fulfilled') {
      mergeToolState(mergedState, result.value.response.toolState);
      succeededServices.add(result.value.name);
      continue;
    }

    const failure = result.reason;
    bindLogger(ctx).warn('mcp_tools_fanout_failed', {
      tenantId: ctx.tenantId,
      service: services[index]?.name ?? 'unknown',
      errorName: failure instanceof Error ? failure.name : 'UnknownError',
      errorMessage: failure instanceof Error ? failure.message : 'unknown error',
    });
  }

  if (succeededServices.size === 0) return null;
  return { toolState: mergedState, succeededServices };
}

async function fetchDownstreamToolState(
  ctx: AppContext,
  serviceName: Exclude<McpServiceName, 'gateway'>,
  service: Fetcher,
  maxBytes: number,
): Promise<DownstreamToolsResponse> {
  let response: Response;
  try {
    response = await fetchWithServiceTimeout(
      service,
      'http://internal/mcp/tools',
      {
        method: 'GET',
        headers: buildDownstreamServiceHeaders(ctx.request.headers, ctx.requestId),
      },
      ctx.env.SERVICE_TIMEOUT_MS,
    );
  } catch (error) {
    throw new Error(
      `Downstream MCP tools request failed for ${serviceName}: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `Downstream MCP tools request for ${serviceName} returned ${response.status}`,
    );
  }

  const body = await parseDownstreamBody(response, maxBytes);
  if (!isDownstreamToolsResponse(body)) {
    throw new Error(`Downstream MCP tools payload for ${serviceName} is invalid`);
  }

  return body;
}

function toolsCacheKey(tenantId: string): string {
  return `mcp:tools:${tenantId}`;
}

function emptyToolState(): McpToolState {
  return {
    availableTools: [],
    unavailableTools: [],
    dynamicTools: [],
  };
}

function mergeToolState(target: McpToolState, incoming: McpToolState): void {
  target.availableTools = dedupeToolMetadata([
    ...target.availableTools,
    ...incoming.availableTools,
  ]);
  target.unavailableTools = dedupeToolMetadata([
    ...target.unavailableTools,
    ...incoming.unavailableTools,
  ]);
  target.dynamicTools = dedupeToolMetadata([
    ...target.dynamicTools,
    ...incoming.dynamicTools,
  ]);
}

function dedupeToolMetadata(tools: ToolMetadata[]): ToolMetadata[] {
  const deduped = new Map<string, ToolMetadata>();
  for (const tool of tools) deduped.set(tool.name, tool);
  return [...deduped.values()];
}

function isDownstreamToolsResponse(value: unknown): value is DownstreamToolsResponse {
  if (!value || typeof value !== 'object') return false;
  return isMcpToolState((value as { toolState?: unknown }).toolState);
}

function isMcpToolState(value: unknown): value is McpToolState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<McpToolState>;
  return (
    Array.isArray(candidate.availableTools) &&
    Array.isArray(candidate.unavailableTools) &&
    Array.isArray(candidate.dynamicTools)
  );
}

function isCachedToolState(value: unknown): value is CachedToolState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as {
    mode?: unknown;
    toolState?: unknown;
    succeededServices?: unknown;
    adoptionSet?: unknown;
  };
  if (candidate.mode === 'fallback') return true;
  return (
    candidate.mode === 'dynamic' &&
    isMcpToolState(candidate.toolState) &&
    isStringArray(candidate.succeededServices) &&
    isStringArray(candidate.adoptionSet)
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

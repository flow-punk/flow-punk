import assert from "node:assert/strict";
import test from "node:test";

import {
  executeJsonRpc,
  IDEMPOTENCY_KEY_HEADER,
  invalidateToolsCacheIfRequired,
  INVALIDATE_TOOLS_HEADER,
  INVALIDATE_TOOLS_REASON_HEADER,
} from "./handler.js";
import type { Env, AppContext } from "../types.js";
import type { SessionState } from "./session-do.js";

function makeKvStub(): {
  kv: KVNamespace;
  deletes: string[];
  reads: Map<string, unknown>;
  writes: Map<string, string>;
} {
  const reads = new Map<string, unknown>();
  const writes = new Map<string, string>();
  const deletes: string[] = [];
  const kv = {
    async get(key: string, _type?: "json") {
      return reads.get(key) ?? null;
    },
    async put(key: string, value: string) {
      writes.set(key, value);
    },
    async delete(key: string) {
      deletes.push(key);
    },
  } as unknown as KVNamespace;
  return { kv, deletes, reads, writes };
}

function makeCtx(env: Partial<Env> = {}, tenantId = "ten_a"): AppContext {
  const fullEnv: Env = {
    CONTACTS_SERVICE: {} as Fetcher,
    PIPELINE_SERVICE: {} as Fetcher,
    AUTOMATIONS_SERVICE: {} as Fetcher,
    AUTH_SERVICE: {} as Fetcher,
    FORMINPUTS_SERVICE: {} as Fetcher,
    CMS_SERVICE: {} as Fetcher,
    USERS_SERVICE: {} as Fetcher,
    MCP_TOOLS_KV: {} as KVNamespace,
    MCP_SESSIONS_KV: {} as KVNamespace,
    MCP_SESSION_DO: {} as DurableObjectNamespace,
    OAUTH_TOKEN_CACHE: {} as KVNamespace,
    DB: {} as D1Database,
    MAX_REQUEST_BODY_BYTES: "0",
    SERVICE_TIMEOUT_MS: "0",
    ALLOWED_ORIGINS: "",
    MCP_TOOLS_DYNAMIC_SERVICES: "",
    EDITION: "indie",
    ...env,
  };
  return {
    request: new Request("http://internal/"),
    env: fullEnv,
    requestId: "req_test",
    tenantId,
  };
}

function makeJsonRpcCtx(body: unknown, env: Partial<Env> = {}): AppContext {
  return {
    ...makeCtx({ MAX_REQUEST_BODY_BYTES: "2048", ...env }, "_system"),
    request: new Request("http://internal/mcp/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    userId: "usr_test",
    credentialId: "cred_test",
    credentialType: "oauth",
    scope: "mcp",
  };
}

function makeSession(): SessionState {
  return {
    sessionId: "mcp_sess_abcdefghijklmnopqrstuv",
    tenantId: "_system",
    userId: "usr_test",
    credentialId: "cred_test",
    credentialType: "oauth",
    createdAt: "2026-05-06T00:00:00.000Z",
    lastSeenAt: "2026-05-06T00:00:00.000Z",
  };
}

test("invalidateToolsCacheIfRequired deletes tenant-keyed cache when header set", async () => {
  const { kv, deletes } = makeKvStub();
  const ctx = makeCtx({ MCP_TOOLS_KV: kv }, "ten_x");
  const headers = new Headers({
    [INVALIDATE_TOOLS_HEADER]: "true",
    [INVALIDATE_TOOLS_REASON_HEADER]: "persons_table_mutated",
  });
  await invalidateToolsCacheIfRequired(headers, ctx);
  assert.deepEqual(deletes, ["mcp:tools:ten_x"]);
});

test("invalidateToolsCacheIfRequired no-ops when header absent", async () => {
  const { kv, deletes } = makeKvStub();
  const ctx = makeCtx({ MCP_TOOLS_KV: kv });
  await invalidateToolsCacheIfRequired(new Headers(), ctx);
  assert.equal(deletes.length, 0);
});

test("invalidateToolsCacheIfRequired no-ops when tenantId missing", async () => {
  const { kv, deletes } = makeKvStub();
  const ctx = makeCtx({ MCP_TOOLS_KV: kv });
  ctx.tenantId = undefined;
  const headers = new Headers({ [INVALIDATE_TOOLS_HEADER]: "true" });
  await invalidateToolsCacheIfRequired(headers, ctx);
  assert.equal(deletes.length, 0);
});

test("IDEMPOTENCY_KEY_HEADER constant matches X-Idempotency-Key (used by withIdempotency)", () => {
  // Documents the contract: gateway-synthesized header must match what
  // service-utils' withIdempotency reads by default.
  assert.equal(IDEMPOTENCY_KEY_HEADER, "X-Idempotency-Key");
});

test("initialize negotiates current MCP protocol version", async () => {
  const response = await executeJsonRpc(
    makeJsonRpcCtx({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "claude.ai", version: "test" },
      },
    }),
    makeSession(),
  );

  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    result: { protocolVersion: string; sessionId: string };
  };
  assert.equal(body.result.protocolVersion, "2025-06-18");
  assert.equal(body.result.sessionId, "mcp_sess_abcdefghijklmnopqrstuv");
});

test("initialize negotiates down instead of rejecting newer MCP protocol versions", async () => {
  const response = await executeJsonRpc(
    makeJsonRpcCtx({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "future-client", version: "test" },
      },
    }),
    makeSession(),
  );

  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    result: { protocolVersion: string };
  };
  assert.equal(body.result.protocolVersion, "2025-06-18");
});

test("initialized notification is accepted without a JSON-RPC response body", async () => {
  const response = await executeJsonRpc(
    makeJsonRpcCtx({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    }),
    makeSession(),
  );

  assert.equal(response.status, 202);
  assert.equal(await response.text(), "");
});

test("tools/list returns compact model tools only", async () => {
  const response = await executeJsonRpc(
    makeJsonRpcCtx({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    }),
    makeSession(),
  );

  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    result: {
      tools: Array<{
        name: string;
        description: string;
        inputSchema: Record<string, unknown>;
      }>;
    };
  };
  const names = body.result.tools.map((tool) => tool.name).sort();
  assert.deepEqual(names, [
    "accounts",
    "deals",
    "persons",
    "pipelines",
    "stages",
  ]);
  assert.equal(names.includes("contacts"), false);
  assert.equal(names.includes("pipeline"), false);
  assert.equal(names.includes("tools_search"), false);
});

test("model describe returns an MCP tool-call content envelope with action schema", async () => {
  const response = await executeJsonRpc(
    makeJsonRpcCtx({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "persons",
        arguments: { action: "describe", arguments: { action: "create" } },
      },
    }),
    makeSession(),
  );

  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    result: {
      content: Array<{ type: string; text: string }>;
      isError: boolean;
    };
  };
  assert.equal(body.result.isError, false);
  assert.equal(body.result.content[0]?.type, "text");
  const payload = JSON.parse(body.result.content[0]!.text) as {
    model: string;
    action: string;
    downstreamName: string;
    inputSchema: { required?: string[] };
  };
  assert.equal(payload.model, "persons");
  assert.equal(payload.action, "create");
  assert.equal(payload.downstreamName, "persons_create");
  assert.deepEqual(payload.inputSchema.required, ["displayName"]);
});

test("model action dispatches to downstream service with underlying tool name", async () => {
  const calls: Array<{ headers: Headers; body: unknown }> = [];
  const contactsService = {
    async fetch(request: Request) {
      calls.push({ headers: request.headers, body: await request.json() });
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: JSON.stringify({ id: "per_123" }) }],
          isError: false,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    },
  } as Fetcher;

  const response = await executeJsonRpc(
    makeJsonRpcCtx(
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "persons",
          arguments: {
            action: "create",
            arguments: { displayName: "Alex Morgan" },
          },
        },
      },
      { CONTACTS_SERVICE: contactsService },
    ),
    makeSession(),
  );

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0]!.headers.get("Mcp-Session-Id"),
    "mcp_sess_abcdefghijklmnopqrstuv",
  );
  assert.equal(calls[0]!.headers.has(IDEMPOTENCY_KEY_HEADER), true);
  assert.deepEqual(calls[0]!.body, {
    sessionId: "mcp_sess_abcdefghijklmnopqrstuv",
    name: "persons_create",
    arguments: { displayName: "Alex Morgan" },
    jsonrpcId: 4,
  });
});

test("old domain expand tool is not exposed", async () => {
  const response = await executeJsonRpc(
    makeJsonRpcCtx({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "contacts",
        arguments: { action: "expand" },
      },
    }),
    makeSession(),
  );

  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    error: { code: number; message: string };
  };
  assert.equal(body.error.code, -32601);
  assert.equal(body.error.message, "Unknown tool: contacts");
});

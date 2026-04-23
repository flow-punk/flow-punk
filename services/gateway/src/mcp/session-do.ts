import type { Env } from '../types.js';
import { extractIdentityHeaders } from '../auth/identity-headers.js';
import {
  SESSION_HEADER,
  SESSION_MODE_HEADER,
  SSE_HEADERS,
  SESSION_IDLE_TIMEOUT_MS,
  createJsonRpcContext,
  executeJsonRpc,
  getSessionId,
  validateMcpSessionIdentity,
} from './handler.js';

const encoder = new TextEncoder();
const SESSION_STORAGE_KEY = 'session';

interface SessionIdentity {
  tenantId: string;
  userId: string;
  credentialId: string;
  credentialType: 'apikey' | 'oauth';
}

export interface SessionState extends SessionIdentity {
  sessionId: string;
  createdAt: string;
  lastSeenAt: string;
}

export class McpSessionDurableObject {
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const requestId = request.headers.get('X-Request-ID') ?? '';
    const identity = validateMcpSessionIdentity(extractIdentityHeaders(request.headers));
    if (!identity) {
      return new Response(
        JSON.stringify({ error: 'unauthorized' }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': requestId,
          },
        },
      );
    }

    switch (request.method) {
      case 'GET':
        return this.openSession(request, identity, requestId);
      case 'POST':
        return this.handleJsonRpc(request, identity, requestId);
      case 'DELETE':
        return this.closeSession(request, identity, requestId);
      default:
        return new Response('Method Not Allowed', {
          status: 405,
          headers: { 'X-Request-ID': requestId },
        });
    }
  }

  async alarm(): Promise<void> {
    const session = await this.loadSession();
    if (!session || !this.isExpired(session, new Date())) return;

    await this.clearSession();
  }

  private async openSession(
    request: Request,
    identity: SessionIdentity,
    requestId: string,
  ): Promise<Response> {
    const sessionId = getSessionId(request);
    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: 'missing_session_id' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': requestId,
          },
        },
      );
    }

    const now = new Date();
    const sessionMode = request.headers.get(SESSION_MODE_HEADER);
    let session = await this.loadSession();
    if (!session) {
      if (sessionMode === 'reattach') {
        return new Response(
          JSON.stringify({ error: 'unknown_session' }),
          {
            status: 404,
            headers: {
              'Content-Type': 'application/json',
              'X-Request-ID': requestId,
            },
          },
        );
      }
      session = {
        sessionId,
        ...identity,
        createdAt: now.toISOString(),
        lastSeenAt: now.toISOString(),
      };
    } else if (!this.isOwnedBy(session, identity)) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': requestId,
        },
      });
    } else if (this.isExpired(session, now)) {
      await this.clearSession();
      session = {
        sessionId,
        ...identity,
        createdAt: now.toISOString(),
        lastSeenAt: now.toISOString(),
      };
    }

    await this.persistSession(session);

    if (this.writer) {
      try {
        await this.writer.close();
      } catch {
        // Stream teardown is best-effort.
      }
      this.writer = null;
    }

    const stream = new TransformStream<Uint8Array, Uint8Array>();
    const writer = stream.writable.getWriter();
    this.writer = writer;
    void writer.closed.finally(() => {
      if (this.writer === writer) this.writer = null;
    });

    await this.emitSseEvent('session', {
      sessionId,
      connectedAt: session.lastSeenAt,
      server: {
        name: 'flowpunk-gateway',
        version: '0.1.0',
      },
    });

    return new Response(stream.readable, {
      status: 200,
      headers: {
        ...SSE_HEADERS,
        'X-Request-ID': requestId,
        [SESSION_HEADER]: sessionId,
      },
    });
  }

  private async handleJsonRpc(
    request: Request,
    identity: SessionIdentity,
    requestId: string,
  ): Promise<Response> {
    const session = await this.requireSession(request, identity, requestId);
    if (session instanceof Response) return session;

    const now = new Date().toISOString();
    const updatedSession: SessionState = {
      ...session,
      lastSeenAt: now,
    };
    await this.persistSession(updatedSession);

    const ctx = createJsonRpcContext(request, this.env, requestId, updatedSession);
    return executeJsonRpc(ctx, updatedSession);
  }

  private async closeSession(
    request: Request,
    identity: SessionIdentity,
    requestId: string,
  ): Promise<Response> {
    const session = await this.requireSession(request, identity, requestId);
    if (session instanceof Response) return session;

    await this.clearSession();

    return new Response(null, {
      status: 204,
      headers: {
        'X-Request-ID': requestId,
      },
    });
  }

  private async requireSession(
    request: Request,
    identity: SessionIdentity,
    requestId: string,
  ): Promise<SessionState | Response> {
    const sessionId = getSessionId(request);
    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: 'missing_session_id' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': requestId,
          },
        },
      );
    }

    const session = await this.loadSession();
    if (!session || session.sessionId !== sessionId) {
      return new Response(
        JSON.stringify({ error: 'unknown_session' }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': requestId,
          },
        },
      );
    }

    if (!this.isOwnedBy(session, identity)) {
      return new Response(
        JSON.stringify({ error: 'forbidden' }),
        {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': requestId,
          },
        },
      );
    }

    if (this.isExpired(session, new Date())) {
      await this.clearSession();
      return new Response(
        JSON.stringify({ error: 'unknown_session' }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': requestId,
          },
        },
      );
    }

    return session;
  }

  private async persistSession(session: SessionState): Promise<void> {
    await this.state.storage.put(SESSION_STORAGE_KEY, session);
    await this.state.storage.setAlarm(Date.parse(session.lastSeenAt) + SESSION_IDLE_TIMEOUT_MS);
  }

  private async loadSession(): Promise<SessionState | null> {
    return (await this.state.storage.get<SessionState>(SESSION_STORAGE_KEY)) ?? null;
  }

  private async clearSession(): Promise<void> {
    if (this.writer) {
      try {
        await this.writer.close();
      } catch {
        // Stream teardown is best-effort.
      }
      this.writer = null;
    }

    await this.state.storage.delete(SESSION_STORAGE_KEY);
    await this.state.storage.deleteAlarm();
  }

  private isOwnedBy(session: SessionState, identity: SessionIdentity): boolean {
    return (
      session.tenantId === identity.tenantId &&
      session.userId === identity.userId &&
      session.credentialId === identity.credentialId &&
      session.credentialType === identity.credentialType
    );
  }

  private isExpired(session: SessionState, now: Date): boolean {
    return now.getTime() - Date.parse(session.lastSeenAt) > SESSION_IDLE_TIMEOUT_MS;
  }

  private async emitSseEvent(event: string, payload: unknown): Promise<void> {
    if (!this.writer) return;
    const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    await this.writer.write(encoder.encode(message));
  }
}

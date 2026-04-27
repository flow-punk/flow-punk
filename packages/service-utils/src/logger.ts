// TODO(ADR-007): integrate pii() Drizzle markers + fallback field list once
// @flowpunk/db lands. Until then, callers must not pass PII via the data
// parameter.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface CredentialDescriptor {
  credentialId: string;
  credentialType: 'apikey' | 'oauth' | 'session';
  keyLabel?: string | null;
}

export interface Logger {
  withRequestId(requestId: string): Logger;
  withTenantId(tenantId: string | undefined): Logger;
  withUserId(userId: string | undefined): Logger;
  withCredential(descriptor: CredentialDescriptor | undefined): Logger;
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

interface BoundContext {
  service: string;
  requestId?: string;
  tenantId?: string;
  userId?: string;
  credential?: CredentialDescriptor;
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

function emit(
  ctx: BoundContext,
  level: LogLevel,
  message: string,
  data?: Record<string, unknown>,
): void {
  const payload: Record<string, unknown> = {};
  if (data) {
    for (const [k, v] of Object.entries(data)) {
      payload[k] = serializeValue(v);
    }
  }
  payload.level = level;
  payload.timestamp = new Date().toISOString();
  payload.service = ctx.service;
  if (ctx.requestId !== undefined) payload.requestId = ctx.requestId;
  if (ctx.tenantId !== undefined) payload.tenantId = ctx.tenantId;
  if (ctx.userId !== undefined) payload.userId = ctx.userId;
  if (ctx.credential !== undefined) {
    payload.credentialId = ctx.credential.credentialId;
    payload.credentialType = ctx.credential.credentialType;
    if (
      ctx.credential.keyLabel !== undefined &&
      ctx.credential.keyLabel !== null
    ) {
      payload.keyLabel = ctx.credential.keyLabel;
    }
  }
  payload.message = message;
  console.log(JSON.stringify(payload));
}

function build(ctx: BoundContext): Logger {
  return {
    withRequestId: (requestId) => build({ ...ctx, requestId }),
    withTenantId: (tenantId) =>
      tenantId === undefined ? build(ctx) : build({ ...ctx, tenantId }),
    withUserId: (userId) =>
      userId === undefined ? build(ctx) : build({ ...ctx, userId }),
    withCredential: (credential) =>
      credential === undefined ? build(ctx) : build({ ...ctx, credential }),
    debug: (message, data) => emit(ctx, 'debug', message, data),
    info: (message, data) => emit(ctx, 'info', message, data),
    warn: (message, data) => emit(ctx, 'warn', message, data),
    error: (message, data) => emit(ctx, 'error', message, data),
  };
}

export function createLogger(opts: { service: string }): Logger {
  return build({ service: opts.service });
}

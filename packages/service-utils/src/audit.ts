/**
 * Structured audit-event emission.
 *
 * Today this writes a single structured log line at info level with message
 * `audit.event` and the event payload as `data`. Phase 3 (queue-backed audit,
 * see ADR-007 addendum) will extend this helper to also publish to
 * `AUDIT_QUEUE` without changing call sites.
 *
 * The `AuditEvent` type is an action-typed discriminated union — there is no
 * free-form `Record<string, unknown>` `detail` field. This is deliberate
 * (per ADR-007 §PII redaction): the logger has not yet integrated `pii()`
 * Drizzle markers, so the helper enforces a per-action whitelist of
 * non-PII fields. Adding a new auditable action means adding a new arm to
 * this union — no escape hatch.
 *
 * No `pii()`-marked column appears in any `detail` shape. Tenant identity
 * in audit logs is `resourceId` (the tenant id), never `displayName`.
 */

import type { Logger } from './logger.js';

interface AuditEventCommon {
  actorId: string;
  actorTenantId: string;
  actorCredentialType: 'apikey' | 'oauth' | 'session';
  resourceType: string;
  resourceId: string;
  /** Optional tenant the action targets (may differ from actorTenantId for
      platform-admin operations against arbitrary tenants). */
  targetTenantId?: string;
}

export type AuditEvent =
  | (AuditEventCommon & {
      action: 'tenants.created';
      detail: { slug: string; plan: 'hobby' | 'pro' };
    })
  | (AuditEventCommon & {
      action: 'tenants.renamed';
      detail: { newSlug: string };
    })
  | (AuditEventCommon & {
      action: 'tenants.suspended';
      // The full suspension reason (caller-supplied free-form text) lives on
      // the `tenants.suspensionReason` row column. The audit log records only
      // that the suspension happened, to keep operator-supplied text out of
      // the structured log surface (which today has no PII redaction).
      detail: Record<string, never>;
    })
  | (AuditEventCommon & {
      action: 'tenants.unsuspended';
      detail: Record<string, never>;
    })
  | (AuditEventCommon & {
      action: 'tenants.softDeleted';
      detail: Record<string, never>;
    })
  | (AuditEventCommon & {
      action: 'tenants.markedProvisioned';
      detail: {
        routerName: string;
        bindingName: string;
        d1DatabaseId: string;
      };
    });

export function emitAuditEvent(logger: Logger, event: AuditEvent): void {
  logger.info('audit.event', event as unknown as Record<string, unknown>);
}

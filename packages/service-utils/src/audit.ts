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
  actorCredentialType: 'apikey' | 'oauth' | 'session' | 'system';
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
    })
  | (AuditEventCommon & {
      action: 'accounts.created';
      // Non-PII fixed-format fields only. `country` is ISO alpha-2 (regex
      // bounded). Free-form caller-controlled strings (e.g. `industry`)
      // are deliberately excluded — an operator could otherwise stuff PII
      // into them and bypass the action-typed allowlist guarantee.
      detail: { country?: string };
    })
  | (AuditEventCommon & {
      action: 'accounts.updated';
      // Column NAMES only — never the new values, since values may be PII.
      // Names are derived from a fixed allowlist (`ALLOWED_PATCH_FIELDS` in
      // `@flowpunk-indie/db`) so unknown/forged keys cannot leak in.
      detail: { fieldsChanged: string[] };
    })
  | (AuditEventCommon & {
      action: 'accounts.softDeleted';
      detail: Record<string, never>;
    })
  | (AuditEventCommon & {
      action: 'persons.created';
      // Boolean only — never the linked account id (would leak which account
      // a person belongs to into the structured log surface). No consent
      // value: consent records are personal data per GDPR Art. 7. A
      // dedicated consent ledger is the right place for value history; this
      // arm follows the accounts pattern of fixed-format-non-PII-only.
      detail: { hasAccountId: boolean };
    })
  | (AuditEventCommon & {
      action: 'persons.updated';
      // Column NAMES only — never the new values, since values may be PII
      // (including `consentEmail`, which is `pii()`-marked at the schema
      // layer per GDPR Art. 7). Names are derived from a fixed allowlist
      // (`ALLOWED_PATCH_FIELDS` in `@flowpunk-indie/db`) so unknown/forged
      // keys cannot leak in.
      detail: { fieldsChanged: string[] };
    })
  | (AuditEventCommon & {
      action: 'persons.softDeleted';
      detail: Record<string, never>;
    });

export function emitAuditEvent(logger: Logger, event: AuditEvent): void {
  logger.info('audit.event', event as unknown as Record<string, unknown>);
}

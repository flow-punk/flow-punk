/**
 * Marks a Drizzle column as containing personally identifiable or sensitive
 * data. Per ADR-007, downstream systems (logger redaction, search indexing,
 * API serialization, data export, audit tooling) introspect the `_pii` flag
 * to decide handling.
 *
 * Usage:
 *   email: pii(text('email'))
 *
 * Detection: any consumer can check `(column as any)._pii === true`. The flag
 * shape is identical to managed/packages/db/src/utils/pii.ts so consumers can
 * walk both schemas with one rule.
 */
export function pii<T>(column: T): T & { _pii: true } {
  (column as { _pii?: true })._pii = true;
  return column as T & { _pii: true };
}

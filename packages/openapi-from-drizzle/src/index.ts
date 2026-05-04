/**
 * Drizzle → OpenAPI 3.1 schema converter.
 *
 * Pure-data: takes a Drizzle table object + caller-supplied metadata (enum
 * values, PATCH allowlist) and returns OpenAPI schema fragments for the
 * entity, its create body, and its patch body.
 *
 * Why caller-supplied enums: Drizzle's `$type<Enum>()` is TypeScript-only —
 * the runtime column object does not carry enum values. Callers pass them
 * in via the `enums` map.
 *
 * Why caller-supplied patch metadata: PATCH allowlists live as
 * `ALLOWED_PATCH_FIELDS` / `NULLABLE_PATCH_FIELDS` constants in each
 * schema file. They are TypeScript constants, not part of the Drizzle
 * column metadata.
 */

import { getTableColumns, type Table } from 'drizzle-orm';

/**
 * Audit/system columns excluded from POST bodies by default. The tables
 * surveyed in this codebase are consistent on this set; callers can override
 * via `options.audit`.
 */
export const DEFAULT_AUDIT_FIELDS = [
  'id',
  'createdAt',
  'createdBy',
  'updatedAt',
  'updatedBy',
  'deletedAt',
  'deletedBy',
  'status',
] as const;

export interface TableToSchemasOptions {
  /** Schema name prefix. e.g. 'Account' produces 'Account', 'AccountCreate', 'AccountPatch'. */
  name: string;
  /** Per-column enum values for `$type<Enum>()` columns. Key = TS column name. */
  enums?: Readonly<Record<string, ReadonlyArray<string>>>;
  /** Override the audit-exclude set for the Create body. */
  audit?: ReadonlyArray<string>;
  /**
   * PATCH allowlist + nullable subset. Omit to skip generating an
   * `EntityPatch` schema (e.g., for entities with no PATCH endpoint).
   */
  patch?: {
    allowed: ReadonlyArray<string>;
    /** Subset of `allowed` whose value can be cleared via explicit `null`. */
    nullable?: ReadonlySet<string> | ReadonlyArray<string>;
  };
  /** Augment the response shape with extra (non-table) properties. Used for joins. */
  extraResponseProps?: Readonly<Record<string, unknown>>;
}

export type DerivedSchemas = Record<string, OpenAPISchema>;

export interface OpenAPISchema {
  type?: string | string[];
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  default?: unknown;
  enum?: unknown[];
  description?: string;
}

type DrizzleColumn = ReturnType<typeof getTableColumns>[string];

/**
 * Returns `{ [name]: Entity, [name+'Create']: EntityCreate, [name+'Patch']: EntityPatch? }`.
 * `EntityPatch` is omitted when `options.patch` is not provided.
 */
export function tableToSchemas(
  table: Table,
  options: TableToSchemasOptions,
): DerivedSchemas {
  const cols = getTableColumns(table) as Record<string, DrizzleColumn>;
  const enums = options.enums ?? {};
  const audit = new Set<string>(options.audit ?? DEFAULT_AUDIT_FIELDS);

  const result: DerivedSchemas = {};
  result[options.name] = buildEntity(cols, enums, options.extraResponseProps);
  result[`${options.name}Create`] = buildCreate(cols, enums, audit);
  if (options.patch) {
    const nullable = normalizeNullable(options.patch.nullable);
    result[`${options.name}Patch`] = buildPatch(
      cols,
      enums,
      options.patch.allowed,
      nullable,
    );
  }
  return result;
}

/** Response shape: every column appears, with type-level nullability. */
function buildEntity(
  cols: Record<string, DrizzleColumn>,
  enums: Readonly<Record<string, ReadonlyArray<string>>>,
  extraProps?: Readonly<Record<string, unknown>>,
): OpenAPISchema {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [name, col] of Object.entries(cols)) {
    properties[name] = columnSchema(col, enums[name]);
    required.push(name); // present in every row (NULL stored as JSON null)
  }
  if (extraProps) {
    for (const [name, schema] of Object.entries(extraProps)) {
      properties[name] = schema;
    }
  }
  return { type: 'object', required, properties };
}

/**
 * POST body: excludes audit/system columns. Required = notNull AND no default
 * AND not in the audit set.
 */
function buildCreate(
  cols: Record<string, DrizzleColumn>,
  enums: Readonly<Record<string, ReadonlyArray<string>>>,
  audit: ReadonlySet<string>,
): OpenAPISchema {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [name, col] of Object.entries(cols)) {
    if (audit.has(name)) continue;
    properties[name] = columnSchema(col, enums[name]);
    if (col.notNull && !col.hasDefault) {
      required.push(name);
    }
  }
  const result: OpenAPISchema = {
    type: 'object',
    properties,
    additionalProperties: false,
  };
  if (required.length > 0) result.required = required;
  return result;
}

/**
 * PATCH body: keys = ALLOWED_PATCH_FIELDS. NULLABLE_PATCH_FIELDS are the
 * subset that accept `null` to clear the value. All fields are optional in
 * PATCH (no `required`); `default` is irrelevant in PATCH (defaults apply
 * to inserts only) so we strip it.
 */
function buildPatch(
  cols: Record<string, DrizzleColumn>,
  enums: Readonly<Record<string, ReadonlyArray<string>>>,
  allowed: ReadonlyArray<string>,
  nullable: ReadonlySet<string>,
): OpenAPISchema {
  const properties: Record<string, unknown> = {};
  for (const name of allowed) {
    const col = cols[name];
    if (!col) {
      throw new Error(
        `tableToSchemas: ALLOWED_PATCH_FIELDS includes "${name}" which is not a column on this table`,
      );
    }
    properties[name] = patchColumnSchema(col, enums[name], nullable.has(name));
  }
  return {
    type: 'object',
    properties,
    additionalProperties: false,
  };
}

function patchColumnSchema(
  col: DrizzleColumn,
  enumValues: ReadonlyArray<string> | undefined,
  isNullable: boolean,
): unknown {
  const baseType = mapColumnType(col);
  if (enumValues) {
    return isNullable
      ? { type: ['string', 'null'], enum: [...enumValues, null] }
      : { type: 'string', enum: [...enumValues] };
  }
  return isNullable ? { type: [baseType, 'null'] } : { type: baseType };
}

function columnSchema(
  col: DrizzleColumn,
  enumValues: ReadonlyArray<string> | undefined,
): unknown {
  const baseType = mapColumnType(col);
  // A column is nullable in storage if it's not NOT NULL and has no default.
  // (A column with a default is filled at insert time and never reads null.)
  const isNullable = !col.notNull && !col.hasDefault;
  const schema: Record<string, unknown> = enumValues
    ? isNullable
      ? { type: ['string', 'null'], enum: [...enumValues, null] }
      : { type: 'string', enum: [...enumValues] }
    : isNullable
      ? { type: [baseType, 'null'] }
      : { type: baseType };
  if (col.hasDefault) {
    const defaultValue = literalDefault(col);
    if (defaultValue !== undefined) {
      schema.default = defaultValue;
    }
  }
  return schema;
}

function mapColumnType(col: DrizzleColumn): 'string' | 'integer' | 'number' {
  // SQLite-specific column types. We only support the dialect this codebase uses.
  const columnType = (col as unknown as { columnType: string }).columnType;
  if (columnType === 'SQLiteText') return 'string';
  if (columnType === 'SQLiteInteger') return 'integer';
  if (columnType === 'SQLiteReal') return 'number';
  // Fall back to dataType for any unrecognized SQLite column type.
  if (col.dataType === 'string') return 'string';
  if (col.dataType === 'number') return 'number';
  throw new Error(
    `openapi-from-drizzle: unsupported column type "${columnType}" / dataType "${col.dataType}"`,
  );
}

/**
 * Returns the column's default value if it's a JSON-serializable literal
 * (string | number | boolean | null). Returns undefined for function defaults
 * (e.g., `$defaultFn(() => crypto.randomUUID())`) — we can't represent those
 * in OpenAPI.
 */
function literalDefault(col: DrizzleColumn): unknown {
  const raw = (col as unknown as { default: unknown }).default;
  if (raw === undefined) return undefined;
  if (typeof raw === 'function') return undefined;
  // SQL expressions (e.g., `sql\`CURRENT_TIMESTAMP\``) are objects; skip them.
  if (typeof raw === 'object' && raw !== null) return undefined;
  return raw;
}

function normalizeNullable(
  input: ReadonlySet<string> | ReadonlyArray<string> | undefined,
): ReadonlySet<string> {
  if (!input) return new Set();
  if (input instanceof Set) return input;
  return new Set(input);
}

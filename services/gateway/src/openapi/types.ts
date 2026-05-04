/**
 * Minimal OpenAPI 3.1 type surface used by the spec assembler.
 *
 * Intentionally loose: spec fragments are hand-authored TypeScript objects
 * exported from `*-spec` packages with `as const`, so the public surface
 * here uses structural / `unknown`-typed leaves to accept those readonly
 * shapes without forcing every fragment to spell out type annotations.
 *
 * The assembler only inspects the `paths` keys (path + HTTP method) and the
 * named entries under `components.{schemas,securitySchemes}`; it treats all
 * leaf values as opaque.
 */

export interface OpenAPIFragment {
  paths?: Readonly<Record<string, PathItemObject>>;
  components?: ComponentsObject;
  tags?: ReadonlyArray<TagObject>;
}

export interface OpenAPIObject {
  openapi: '3.1.0';
  info: InfoObject;
  servers?: ServerObject[];
  security?: SecurityRequirementObject[];
  paths: Record<string, PathItemObject>;
  components: ComponentsObject;
  tags?: TagObject[];
}

export interface InfoObject {
  title: string;
  version: string;
  description?: string;
}

export interface ServerObject {
  url: string;
  description?: string;
}

export interface SecurityRequirementObject {
  [name: string]: ReadonlyArray<string>;
}

/**
 * A path item is a plain object whose enumerable string-keyed entries are
 * either HTTP-method operations (`get`, `post`, ...) or `parameters`. We
 * model it as a loose record so fragments can use `as const` freely without
 * tripping over readonly-vs-mutable mismatches.
 */
export type PathItemObject = {
  readonly [key: string]: unknown;
};

export interface ComponentsObject {
  schemas?: Readonly<Record<string, unknown>>;
  securitySchemes?: Readonly<Record<string, unknown>>;
}

export interface TagObject {
  name: string;
  description?: string;
}

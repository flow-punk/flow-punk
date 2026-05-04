/**
 * OpenAPI spec assembler.
 *
 * Pure data-only module — runs both inside the gateway worker (for the
 * `/openapi.json` handler) and under Node via `tsx` (for the dump script).
 * MUST NOT import worker bindings, middleware, or any module that touches
 * Cloudflare runtime globals; doing so breaks the dump script.
 *
 * Merges fragments into a complete OpenAPIObject. Throws on path+method
 * collisions and on conflicting component schema definitions so test/CI
 * catches stale or duplicated entries.
 */

import type {
  ComponentsObject,
  InfoObject,
  OpenAPIFragment,
  OpenAPIObject,
  PathItemObject,
  TagObject,
  ServerObject,
  SecurityRequirementObject,
} from './types.js';

export interface AssembleInput {
  info: InfoObject;
  fragments: ReadonlyArray<OpenAPIFragment>;
  servers?: ServerObject[];
  security?: SecurityRequirementObject[];
}

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options'] as const;

export function assembleSpec(input: AssembleInput): OpenAPIObject {
  const paths: Record<string, PathItemObject> = {};
  const schemas: Record<string, unknown> = {};
  const securitySchemes: Record<string, unknown> = {};
  const tagsByName = new Map<string, TagObject>();

  for (const fragment of input.fragments) {
    mergePaths(paths, fragment.paths);
    mergeNamed(schemas, fragment.components?.schemas, 'components.schemas');
    mergeNamed(securitySchemes, fragment.components?.securitySchemes, 'components.securitySchemes');
    mergeTags(tagsByName, fragment.tags);
  }

  const components: ComponentsObject = {};
  if (Object.keys(schemas).length > 0) components.schemas = schemas;
  if (Object.keys(securitySchemes).length > 0) components.securitySchemes = securitySchemes;

  const result: OpenAPIObject = {
    openapi: '3.1.0',
    info: input.info,
    paths,
    components,
  };
  if (input.servers && input.servers.length > 0) result.servers = input.servers;
  if (input.security && input.security.length > 0) result.security = input.security;
  if (tagsByName.size > 0) {
    result.tags = Array.from(tagsByName.values()).sort((a, b) => a.name.localeCompare(b.name));
  }
  return result;
}

function mergePaths(
  acc: Record<string, PathItemObject>,
  next: Readonly<Record<string, PathItemObject>> | undefined,
): void {
  if (!next) return;
  for (const [path, item] of Object.entries(next)) {
    const incomingItem = item as Record<string, unknown>;
    const existing = acc[path] as Record<string, unknown> | undefined;
    if (!existing) {
      acc[path] = { ...incomingItem } as PathItemObject;
      continue;
    }
    // Merge methods; collisions on the same method throw.
    const merged: Record<string, unknown> = { ...existing };
    for (const method of HTTP_METHODS) {
      const incoming = incomingItem[method];
      if (incoming === undefined) continue;
      if (merged[method] !== undefined) {
        throw new Error(
          `OpenAPI path collision: ${method.toUpperCase()} ${path} declared by multiple fragments`,
        );
      }
      merged[method] = incoming;
    }
    if (Array.isArray(incomingItem.parameters)) {
      const existingParams = Array.isArray(existing.parameters) ? existing.parameters : [];
      merged.parameters = [...existingParams, ...(incomingItem.parameters as unknown[])];
    }
    acc[path] = merged as PathItemObject;
  }
}

function mergeNamed(
  acc: Record<string, unknown>,
  next: Readonly<Record<string, unknown>> | undefined,
  context: string,
): void {
  if (!next) return;
  for (const [name, value] of Object.entries(next)) {
    if (Object.prototype.hasOwnProperty.call(acc, name)) {
      // Allow identical re-declarations (a shared schema can be exported
      // by multiple fragments by value); reject divergent ones.
      const existing = acc[name];
      if (JSON.stringify(existing) !== JSON.stringify(value)) {
        throw new Error(
          `OpenAPI ${context} collision: "${name}" defined with conflicting shapes by multiple fragments`,
        );
      }
      continue;
    }
    acc[name] = value;
  }
}

function mergeTags(
  acc: Map<string, TagObject>,
  next: ReadonlyArray<TagObject> | undefined,
): void {
  if (!next) return;
  for (const tag of next) {
    const existing = acc.get(tag.name);
    if (!existing) {
      acc.set(tag.name, { ...tag });
      continue;
    }
    // Prefer non-empty descriptions if a later fragment provides one.
    if (!existing.description && tag.description) {
      acc.set(tag.name, { ...existing, description: tag.description });
    }
  }
}

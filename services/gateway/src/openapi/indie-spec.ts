/**
 * Indie spec: fragment list + info + assembled-spec builder.
 *
 * Pure data — safe to import from both the gateway worker and the Node
 * dump script. Managed extends by importing INDIE_FRAGMENTS and INDIE_INFO,
 * appending its own fragments, and calling assembleSpec directly.
 */

import { authSpec } from '@flowpunk-indie/auth-spec';
import { contactsSpec } from '@flowpunk-indie/contacts-spec';
import { pipelineSpec } from '@flowpunk-indie/pipeline-spec';
import { usersSpec } from '@flowpunk-indie/users-spec';

import { assembleSpec } from './assemble.js';
import { gatewaySpec } from './gateway-spec.js';
import type { OpenAPIFragment, OpenAPIObject } from './types.js';

export const INDIE_INFO = {
  title: 'flow-punk Indie API',
  version: '0.1.0',
  description:
    'Indie edition. REST + MCP surface served by the indie gateway. ' +
    'For tenant management, OAuth, and other managed-only endpoints, see the managed edition.',
} as const;

export const INDIE_FRAGMENTS: ReadonlyArray<OpenAPIFragment> = [
  gatewaySpec,
  authSpec,
  contactsSpec,
  pipelineSpec,
  usersSpec,
];

export const INDIE_SERVERS = [
  { url: 'http://localhost:8787', description: 'Local dev (wrangler dev)' },
] as const;

export function buildIndieSpec(): OpenAPIObject {
  return assembleSpec({
    info: INDIE_INFO,
    fragments: INDIE_FRAGMENTS,
    servers: [...INDIE_SERVERS],
    security: [{ BearerAuth: [] }],
  });
}

import { personsRepo } from '@flowpunk-indie/db';

import type { Actor, ContactsEnv } from '../../types.js';
import { badRequest, getDb, jsonResponse, mapRepoError } from '../_shared.js';

const MAX_LIMIT = 200;
const ACCOUNT_ID_REGEX = /^acct_[a-z0-9]{21}$/;

export async function handleListPersons(
  request: Request,
  env: ContactsEnv,
  _actor: Actor,
): Promise<Response> {
  const url = new URL(request.url);

  let limit: number | undefined;
  const limitRaw = url.searchParams.get('limit');
  if (limitRaw !== null) {
    const parsed = Number(limitRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
      return badRequest(
        'INVALID_INPUT',
        `limit must be an integer in [1, ${MAX_LIMIT}]`,
      );
    }
    limit = parsed;
  }

  const cursor = url.searchParams.get('cursor');

  let accountId: string | undefined;
  const accountIdRaw = url.searchParams.get('accountId');
  if (accountIdRaw !== null) {
    if (!ACCOUNT_ID_REGEX.test(accountIdRaw)) {
      return badRequest(
        'INVALID_INPUT',
        'accountId must match "acct_<21 lowercase alphanumeric>"',
      );
    }
    accountId = accountIdRaw;
  }

  // `includeDeleted` is intentionally NOT exposed on this public handler:
  // the gateway only enforces read/write scope, not admin gating, so any
  // read-capable credential could otherwise dump soft-deleted PII. The
  // repo accepts the option for future internal callers behind an admin
  // gate; the HTTP surface forces `false`.

  try {
    const db = getDb(env);
    const result = await personsRepo.list(db, {
      limit,
      cursor,
      accountId,
      includeDeleted: false,
    });
    return jsonResponse(200, {
      items: result.items,
      nextCursor: result.nextCursor,
    });
  } catch (err) {
    return mapRepoError(err);
  }
}

import { accountsRepo } from '@flowpunk-indie/db';

import type { Actor, ContactsEnv } from '../../types.js';
import {
  emitContactsAudit,
  getDb,
  jsonResponse,
  mapRepoError,
} from '../_shared.js';

export async function handleSoftDeleteAccount(
  _request: Request,
  env: ContactsEnv,
  actor: Actor,
  id: string,
): Promise<Response> {
  try {
    const db = getDb(env);
    const now = new Date().toISOString();
    const account = await accountsRepo.softDelete(db, id, actor.userId, now);

    emitContactsAudit(actor, {
      action: 'accounts.softDeleted',
      resourceType: 'account',
      resourceId: account.id,
      detail: {},
    });

    return jsonResponse(200, { account });
  } catch (err) {
    return mapRepoError(err);
  }
}

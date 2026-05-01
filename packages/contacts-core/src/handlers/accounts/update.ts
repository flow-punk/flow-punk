import { accountsRepo, type UpdateAccountPatch } from '@flowpunk-indie/db';

import type { Actor, ContactsEnv } from '../../types.js';
import {
  emitContactsAudit,
  getDb,
  jsonResponse,
  mapRepoError,
  requireJsonBody,
} from '../_shared.js';

export async function handleUpdateAccount(
  request: Request,
  env: ContactsEnv,
  actor: Actor,
  id: string,
): Promise<Response> {
  const body = await requireJsonBody<UpdateAccountPatch>(request);
  if (body.kind === 'err') return body.response;

  try {
    const db = getDb(env);
    const now = new Date().toISOString();
    const result = await accountsRepo.update(
      db,
      id,
      body.value,
      actor.userId,
      now,
    );

    if (result.fieldsChanged.length > 0) {
      emitContactsAudit(actor, {
        action: 'accounts.updated',
        resourceType: 'account',
        resourceId: result.account.id,
        detail: { fieldsChanged: result.fieldsChanged },
      });
    }

    return jsonResponse(200, { account: result.account });
  } catch (err) {
    return mapRepoError(err);
  }
}

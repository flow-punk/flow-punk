import { accountsRepo, type CreateAccountInput } from '@flowpunk-indie/db';

import type { Actor, ContactsEnv } from '../../types.js';
import {
  emitContactsAudit,
  getDb,
  jsonResponse,
  mapRepoError,
  requireJsonBody,
} from '../_shared.js';

export async function handleCreateAccount(
  request: Request,
  env: ContactsEnv,
  actor: Actor,
): Promise<Response> {
  const body = await requireJsonBody<CreateAccountInput>(request);
  if (body.kind === 'err') return body.response;

  try {
    const db = getDb(env);
    const now = new Date().toISOString();
    const account = await accountsRepo.create(db, body.value, actor.userId, now);

    emitContactsAudit(actor, {
      action: 'accounts.created',
      resourceType: 'account',
      resourceId: account.id,
      detail: {
        ...(account.country ? { country: account.country } : {}),
      },
    });

    return jsonResponse(201, { account });
  } catch (err) {
    return mapRepoError(err);
  }
}

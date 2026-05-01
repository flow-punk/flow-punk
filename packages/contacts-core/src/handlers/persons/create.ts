import { personsRepo, type CreatePersonInput } from '@flowpunk-indie/db';

import type { Actor, ContactsEnv } from '../../types.js';
import {
  emitContactsAudit,
  getDb,
  jsonResponse,
  mapRepoError,
  requireJsonBody,
} from '../_shared.js';

export async function handleCreatePerson(
  request: Request,
  env: ContactsEnv,
  actor: Actor,
): Promise<Response> {
  const body = await requireJsonBody<CreatePersonInput>(request);
  if (body.kind === 'err') return body.response;

  try {
    const db = getDb(env);
    const now = new Date().toISOString();
    const person = await personsRepo.create(db, body.value, actor.userId, now);

    emitContactsAudit(actor, {
      action: 'persons.created',
      resourceType: 'person',
      resourceId: person.id,
      detail: { hasAccountId: person.accountId !== null },
    });

    return jsonResponse(201, { person });
  } catch (err) {
    return mapRepoError(err);
  }
}

import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';

import { users, type User } from '../schema/users.js';

type Db = DrizzleD1Database<Record<string, never>>;

export async function findById(db: Db, id: string): Promise<User | null> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

import { createId } from '@pachat/shared';
import { getDb } from '../db/index.js';
import type { SessionRow } from './rows.js';

/**
 * Refresh-token sessions, one row per signed-in device.
 *
 * Only the SHA-256 digest of a refresh token is stored, so the table is not
 * replayable if it leaks. Rotation on every refresh means a stolen token is
 * usable at most once before the legitimate client invalidates it.
 */

export interface CreateSessionInput {
  userId: string;
  refreshTokenHash: string;
  expiresAt: number;
  userAgent?: string | null;
  ip?: string | null;
}

export function createSession(input: CreateSessionInput): SessionRow {
  const db = getDb();
  const now = Date.now();
  const id = createId(now);

  db.prepare(
    `INSERT INTO sessions (
       id, user_id, refresh_token_hash, user_agent, ip,
       created_at, last_used_at, expires_at, revoked_at
     ) VALUES (@id, @userId, @hash, @userAgent, @ip, @now, @now, @expiresAt, NULL)`,
  ).run({
    id,
    userId: input.userId,
    hash: input.refreshTokenHash,
    userAgent: input.userAgent ?? null,
    ip: input.ip ?? null,
    now,
    expiresAt: input.expiresAt,
  });

  return getDb().prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow;
}

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

/** Looks up a live (unrevoked, unexpired) session by refresh token digest. */
export function findLiveSessionByDigest(digest: string): SessionRow | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM sessions
        WHERE refresh_token_hash = ? AND revoked_at IS NULL AND expires_at > ?`,
    )
    .get(digest, Date.now()) as SessionRow | undefined;
  return row ?? null;
}

export function findSessionById(id: string): SessionRow | null {
  const row = getDb().prepare('SELECT * FROM sessions WHERE id = ?').get(id) as
    SessionRow | undefined;
  return row ?? null;
}

export function isSessionLive(id: string): boolean {
  const row = getDb()
    .prepare(
      `SELECT 1 AS live FROM sessions
        WHERE id = ? AND revoked_at IS NULL AND expires_at > ?`,
    )
    .get(id, Date.now()) as { live: number } | undefined;
  return Boolean(row);
}

/**
 * Rotates a session's refresh token in place, keeping the session id stable so
 * the device keeps its identity in the session list.
 */
export function rotateSession(id: string, nextDigest: string, nextExpiresAt: number): void {
  getDb()
    .prepare(
      `UPDATE sessions
          SET refresh_token_hash = @digest, expires_at = @expiresAt, last_used_at = @now
        WHERE id = @id`,
    )
    .run({ id, digest: nextDigest, expiresAt: nextExpiresAt, now: Date.now() });
}

export function revokeSession(id: string): void {
  getDb()
    .prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
    .run(Date.now(), id);
}

/** Signs a user out of every device — used after a password change. */
export function revokeAllSessionsFor(userId: string): number {
  const result = getDb()
    .prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
    .run(Date.now(), userId);
  return result.changes;
}

/** Deletes expired and long-revoked rows. Called on boot and daily. */
export function pruneSessions(): number {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const result = getDb()
    .prepare(
      'DELETE FROM sessions WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)',
    )
    .run(Date.now(), cutoff);
  return result.changes;
}

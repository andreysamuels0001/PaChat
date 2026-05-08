import {
  createId,
  DEFAULT_PREFERENCES,
  type AccentColor,
  type Preferences,
  type PresenceState,
  type Self,
  type User,
} from '@pachat/shared';
import { getDb } from '../db/index.js';
import { toSelf, toUser, type UserRow } from './rows.js';

/**
 * All user reads and writes. Every statement is prepared lazily and cached by
 * `better-sqlite3`, so repeated calls reuse the compiled plan.
 */

const SELECT = 'SELECT * FROM users';

export function findUserById(id: string): UserRow | null {
  return (getDb().prepare(`${SELECT} WHERE id = ?`).get(id) as UserRow | undefined) ?? null;
}

export function findUserByEmail(email: string): UserRow | null {
  return (
    (getDb().prepare(`${SELECT} WHERE email = ?`).get(email.toLowerCase()) as
      UserRow | undefined) ?? null
  );
}

export function findUserByUsername(username: string): UserRow | null {
  return (
    (getDb().prepare(`${SELECT} WHERE username = ?`).get(username.toLowerCase()) as
      UserRow | undefined) ?? null
  );
}

/** Resolves a login identifier that may be either an email or a username. */
export function findUserByIdentifier(identifier: string): UserRow | null {
  const needle = identifier.trim().toLowerCase();
  return (
    (getDb().prepare(`${SELECT} WHERE email = ? OR username = ?`).get(needle, needle) as
      UserRow | undefined) ?? null
  );
}

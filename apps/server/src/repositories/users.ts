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

export interface CreateUserInput {
  email: string;
  username: string;
  displayName: string;
  passwordHash: string;
  accentColor: AccentColor;
  title?: string | null;
}

export function createUser(input: CreateUserInput): UserRow {
  const db = getDb();
  const now = Date.now();
  const id = createId(now);

  db.prepare(
    `INSERT INTO users (
       id, email, username, display_name, password_hash, avatar_url, accent_color,
       title, presence_state, presence_message, last_seen_at, preferences,
       created_at, updated_at
     ) VALUES (
       @id, @email, @username, @displayName, @passwordHash, NULL, @accentColor,
       @title, 'offline', NULL, @now, @preferences, @now, @now
     )`,
  ).run({
    id,
    email: input.email.toLowerCase(),
    username: input.username.toLowerCase(),
    displayName: input.displayName,
    passwordHash: input.passwordHash,
    accentColor: input.accentColor,
    title: input.title ?? null,
    now,
    preferences: JSON.stringify({ ...DEFAULT_PREFERENCES, accentColor: input.accentColor }),
  });

  const row = findUserById(id);
  if (!row) throw new Error('user vanished immediately after insert');
  return row;
}

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

export interface ProfilePatch {
  displayName?: string;
  title?: string | null;
  accentColor?: AccentColor;
  avatarUrl?: string | null;
}

/**
 * Applies a sparse profile patch. Builds the SET clause from only the keys
 * actually present, so an omitted field is never silently overwritten with
 * `undefined`.
 */
export function updateProfile(id: string, patch: ProfilePatch): UserRow {
  const assignments: string[] = [];
  const params: Record<string, unknown> = { id, now: Date.now() };

  if (patch.displayName !== undefined) {
    assignments.push('display_name = @displayName');
    params.displayName = patch.displayName;
  }
  if (patch.title !== undefined) {
    assignments.push('title = @title');
    params.title = patch.title;
  }
  if (patch.accentColor !== undefined) {
    assignments.push('accent_color = @accentColor');
    params.accentColor = patch.accentColor;
  }
  if (patch.avatarUrl !== undefined) {
    assignments.push('avatar_url = @avatarUrl');
    params.avatarUrl = patch.avatarUrl;
  }

  if (assignments.length > 0) {
    assignments.push('updated_at = @now');
    getDb()
      .prepare(`UPDATE users SET ${assignments.join(', ')} WHERE id = @id`)
      .run(params);
  }

  const row = findUserById(id);
  if (!row) throw new Error(`user ${id} not found`);
  return row;
}

/** Merges a sparse preferences patch into the stored JSON blob. */
export function updatePreferences(id: string, patch: Partial<Preferences>): UserRow {
  const row = findUserById(id);
  if (!row) throw new Error(`user ${id} not found`);

  const current = toSelf(row).preferences;
  const next: Preferences = { ...current, ...patch };

  getDb()
    .prepare('UPDATE users SET preferences = @preferences, updated_at = @now WHERE id = @id')
    .run({ id, preferences: JSON.stringify(next), now: Date.now() });

  // An accent change in preferences is mirrored onto the public column so
  // other members see the new colour without reading private preferences.
  if (patch.accentColor && patch.accentColor !== row.accent_color) {
    return updateProfile(id, { accentColor: patch.accentColor });
  }

  return findUserById(id)!;
}

export function setPresence(
  id: string,
  state: PresenceState,
  message?: string | null,
): UserRow | null {
  const assignments = ['presence_state = @state', 'last_seen_at = @now', 'updated_at = @now'];
  const params: Record<string, unknown> = { id, state, now: Date.now() };

  if (message !== undefined) {
    assignments.push('presence_message = @message');
    params.message = message;
  }

  getDb()
    .prepare(`UPDATE users SET ${assignments.join(', ')} WHERE id = @id`)
    .run(params);

  return findUserById(id);
}

export function touchLastSeen(id: string): void {
  getDb().prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(Date.now(), id);
}

/**
 * Every user that shares at least one conversation with `userId`, plus the
 * viewer. This is the visibility boundary: a member is never told about
 * accounts they have no channel in common with.
 */
export function listVisibleUsers(userId: string): User[] {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT u.*
         FROM users u
         JOIN conversation_members m  ON m.user_id = u.id
        WHERE m.conversation_id IN (
                SELECT conversation_id FROM conversation_members WHERE user_id = ?
              )
           OR u.id = ?
        ORDER BY u.display_name COLLATE NOCASE`,
    )
    .all(userId, userId) as UserRow[];
  return rows.map(toUser);
}

/** The full member directory, used by the "new conversation" picker. */
export function listDirectory(excludeUserId: string): User[] {
  const rows = getDb()
    .prepare(`${SELECT} WHERE id != ? ORDER BY display_name COLLATE NOCASE`)
    .all(excludeUserId) as UserRow[];
  return rows.map(toUser);
}

export function getSelf(id: string): Self | null {
  const row = findUserById(id);
  return row ? toSelf(row) : null;
}

export function getPublicUser(id: string): User | null {
  const row = findUserById(id);
  return row ? toUser(row) : null;
}

/** Marks every account offline — called on boot to clear stale presence. */
export function resetAllPresence(): void {
  getDb()
    .prepare(`UPDATE users SET presence_state = 'offline' WHERE presence_state != 'offline'`)
    .run();
}

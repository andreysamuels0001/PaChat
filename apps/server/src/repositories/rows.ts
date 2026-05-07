import {
  DEFAULT_PREFERENCES,
  type AccentColor,
  type Attachment,
  type ConversationKind,
  type MemberRole,
  type MessageKind,
  type Preferences,
  type PresenceState,
  type Self,
  type User,
} from '@pachat/shared';

/**
 * Row shapes exactly as SQLite returns them, plus the mappers that lift them
 * into the shared domain model.
 *
 * Keeping the translation in one place means the rest of the server only ever
 * handles validated domain objects — snake_case columns and SQLite's
 * integer-for-boolean convention never leak past this file.
 */

export const asBool = (value: number | null | undefined): boolean => value === 1;
export const asInt = (value: boolean): 0 | 1 => (value ? 1 : 0);

/* ──────────────────────────────────────────────────────────────── users ────*/

export interface UserRow {
  id: string;
  email: string;
  username: string;
  display_name: string;
  password_hash: string;
  avatar_url: string | null;
  accent_color: string;
  title: string | null;
  presence_state: string;
  presence_message: string | null;
  last_seen_at: number;
  preferences: string;
  created_at: number;
  updated_at: number;
}

function parsePreferences(json: string): Preferences {
  try {
    const parsed = JSON.parse(json) as Partial<Preferences>;
    // Merge over defaults rather than replacing, so a preference added in a
    // later release gets a sensible value for accounts created before it.
    return { ...DEFAULT_PREFERENCES, ...parsed };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

/** The projection safe to broadcast to other members. */
export function toUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    accentColor: row.accent_color as AccentColor,
    title: row.title,
    presence: {
      state: row.presence_state as PresenceState,
      message: row.presence_message,
      lastSeenAt: row.last_seen_at,
    },
    createdAt: row.created_at,
  };
}

/** The authenticated user's own record, including private fields. */
export function toSelf(row: UserRow): Self {
  return {
    ...toUser(row),
    email: row.email,
    preferences: parsePreferences(row.preferences),
  };
}

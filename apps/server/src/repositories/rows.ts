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

/* ──────────────────────────────────────────────────────── conversations ────*/

export interface ConversationRow {
  id: string;
  kind: string;
  name: string | null;
  topic: string | null;
  icon: string | null;
  is_private: number;
  direct_key: string | null;
  created_by: string;
  created_at: number;
  updated_at: number;
}

export interface MemberRow {
  conversation_id: string;
  user_id: string;
  role: string;
  joined_at: number;
  last_read_at: number;
  is_muted: number;
  is_pinned: number;
}

export const conversationKindOf = (row: ConversationRow): ConversationKind =>
  row.kind as ConversationKind;

export const memberRoleOf = (row: MemberRow): MemberRole => row.role as MemberRole;

/* ─────────────────────────────────────────────────────────────messages ────*/

export interface MessageRow {
  id: string;
  conversation_id: string;
  author_id: string;
  kind: string;
  body: string;
  reply_to_id: string | null;
  nonce: string | null;
  created_at: number;
  edited_at: number | null;
  deleted_at: number | null;
}

export const messageKindOf = (row: MessageRow): MessageKind => row.kind as MessageKind;

export interface ReactionRow {
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: number;
}

/* ───────────────────────────────────────────────────────── attachments ────*/

export interface AttachmentRow {
  id: string;
  message_id: string | null;
  owner_id: string;
  name: string;
  mime_type: string;
  byte_size: number;
  storage_key: string;
  width: number | null;
  height: number | null;
  created_at: number;
}

export function toAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    name: row.name,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    // Served by the static file route mounted at `/files`. The name is
    // appended so a browser download gets a sensible filename.
    url: `/files/${row.storage_key}/${encodeURIComponent(row.name)}`,
    width: row.width,
    height: row.height,
  };
}

/* ─────────────────────────────────────────────────────────── sessions ────*/

export interface SessionRow {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  user_agent: string | null;
  ip: string | null;
  created_at: number;
  last_used_at: number;
  expires_at: number;
  revoked_at: number | null;
}

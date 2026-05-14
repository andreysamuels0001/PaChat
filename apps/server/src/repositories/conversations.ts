import {
  createId,
  type Conversation,
  type ConversationMember,
  type MemberRole,
} from '@pachat/shared';
import { getDb, transaction } from '../db/index.js';
import {
  asBool,
  conversationKindOf,
  memberRoleOf,
  type ConversationRow,
  type MemberRow,
} from './rows.js';
import { hydrateMessages, unreadFor, type UnreadSummary } from './messages.js';
import type { MessageRow } from './rows.js';

/**
 * Conversation persistence.
 *
 * Every read is parameterised by a *viewer*, because a conversation is not a
 * single global object: unread counts, mute state and pin state are all
 * per-member. The viewer argument makes that asymmetry explicit instead of
 * leaving it to callers to remember.
 */

export interface Viewer {
  id: string;
  username: string;
}

/* ─────────────────────────────────────────────────────────── membership ────*/

export function isMember(conversationId: string, userId: string): boolean {
  const row = getDb()
    .prepare('SELECT 1 AS hit FROM conversation_members WHERE conversation_id = ? AND user_id = ?')
    .get(conversationId, userId) as { hit: number } | undefined;
  return Boolean(row);
}

export function memberIdsOf(conversationId: string): string[] {
  const rows = getDb()
    .prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ?')
    .all(conversationId) as Array<{ user_id: string }>;
  return rows.map((r) => r.user_id);
}

export function membersOf(conversationId: string): ConversationMember[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM conversation_members
        WHERE conversation_id = ?
        ORDER BY joined_at ASC`,
    )
    .all(conversationId) as MemberRow[];
  return rows.map(toMember);
}

export function memberRecord(conversationId: string, userId: string): MemberRow | null {
  const row = getDb()
    .prepare('SELECT * FROM conversation_members WHERE conversation_id = ? AND user_id = ?')
    .get(conversationId, userId) as MemberRow | undefined;
  return row ?? null;
}

function toMember(row: MemberRow): ConversationMember {
  return {
    userId: row.user_id,
    role: memberRoleOf(row),
    joinedAt: row.joined_at,
    lastReadAt: row.last_read_at,
  };
}

/** Every conversation id that `userId` belongs to — used to join socket rooms. */
export function conversationIdsFor(userId: string): string[] {
  const rows = getDb()
    .prepare('SELECT conversation_id FROM conversation_members WHERE user_id = ?')
    .all(userId) as Array<{ conversation_id: string }>;
  return rows.map((r) => r.conversation_id);
}

/* ─────────────────────────────────────────────────────────── hydration ────*/

function hydrate(
  row: ConversationRow,
  members: ConversationMember[],
  lastMessageRow: MessageRow | null,
  memberFlags: Pick<MemberRow, 'is_muted' | 'is_pinned' | 'last_read_at'> | null,
  unread: UnreadSummary,
): Conversation {
  return {
    id: row.id,
    kind: conversationKindOf(row),
    name: row.name,
    topic: row.topic,
    icon: row.icon,
    isPrivate: asBool(row.is_private),
    members,
    lastMessage: lastMessageRow ? (hydrateMessages([lastMessageRow])[0] ?? null) : null,
    unreadCount: unread.count,
    hasUnreadMention: unread.hasMention,
    isMuted: memberFlags ? asBool(memberFlags.is_muted) : false,
    isPinned: memberFlags ? asBool(memberFlags.is_pinned) : false,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

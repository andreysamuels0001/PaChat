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

/**
 * Loads every conversation visible to the viewer, fully hydrated.
 *
 * Members and last messages are fetched in two batch queries rather than per
 * conversation, so the bootstrap payload costs a constant number of statements
 * no matter how many channels the member has joined.
 */
export function listForViewer(viewer: Viewer): Conversation[] {
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT c.*
         FROM conversations c
         JOIN conversation_members m ON m.conversation_id = c.id
        WHERE m.user_id = ?
        ORDER BY m.is_pinned DESC, c.updated_at DESC`,
    )
    .all(viewer.id) as ConversationRow[];

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const marks = new Array(ids.length).fill('?').join(', ');

  const memberRows = db
    .prepare(
      `SELECT * FROM conversation_members
        WHERE conversation_id IN (${marks})
        ORDER BY joined_at ASC`,
    )
    .all(...ids) as MemberRow[];

  const membersByConversation = new Map<string, ConversationMember[]>();
  const viewerFlags = new Map<string, MemberRow>();
  for (const row of memberRows) {
    const list = membersByConversation.get(row.conversation_id) ?? [];
    list.push(toMember(row));
    membersByConversation.set(row.conversation_id, list);
    if (row.user_id === viewer.id) viewerFlags.set(row.conversation_id, row);
  }

  // One row per conversation: its newest message. The correlated subquery is
  // index-served by `(conversation_id, id DESC)`.
  const lastRows = db
    .prepare(
      `SELECT * FROM messages
        WHERE id IN (
          SELECT (SELECT id FROM messages m2
                   WHERE m2.conversation_id = c.id
                   ORDER BY m2.id DESC LIMIT 1)
            FROM conversations c
           WHERE c.id IN (${marks})
        )`,
    )
    .all(...ids) as MessageRow[];

  const lastByConversation = new Map<string, MessageRow>();
  for (const row of lastRows) lastByConversation.set(row.conversation_id, row);

  return rows.map((row) => {
    const flags = viewerFlags.get(row.id) ?? null;
    const unread = flags
      ? unreadFor(row.id, viewer.id, viewer.username, flags.last_read_at)
      : { count: 0, hasMention: false };
    return hydrate(
      row,
      membersByConversation.get(row.id) ?? [],
      lastByConversation.get(row.id) ?? null,
      flags,
      unread,
    );
  });
}

/** A single conversation, or `null` when the viewer is not a member. */
export function getForViewer(conversationId: string, viewer: Viewer): Conversation | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId) as
    ConversationRow | undefined;
  if (!row) return null;

  const flags = memberRecord(conversationId, viewer.id);
  if (!flags) return null;

  const lastRow = db
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1')
    .get(conversationId) as MessageRow | undefined;

  const unread = unreadFor(conversationId, viewer.id, viewer.username, flags.last_read_at);

  return hydrate(row, membersOf(conversationId), lastRow ?? null, flags, unread);
}

/** Raw row lookup, for authorisation checks that do not need hydration. */
export function findConversationRow(id: string): ConversationRow | null {
  const row = getDb().prepare('SELECT * FROM conversations WHERE id = ?').get(id) as
    ConversationRow | undefined;
  return row ?? null;
}

/* ──────────────────────────────────────────────────────────── creation ────*/

export interface CreateChannelRecord {
  name: string;
  topic?: string | null;
  icon?: string | null;
  isPrivate: boolean;
  createdBy: string;
  memberIds: string[];
}

export function createChannel(input: CreateChannelRecord): string {
  return transaction((db) => {
    const now = Date.now();
    const id = createId(now);

    db.prepare(
      `INSERT INTO conversations (
         id, kind, name, topic, icon, is_private, direct_key, created_by, created_at, updated_at
       ) VALUES (@id, 'channel', @name, @topic, @icon, @isPrivate, NULL, @createdBy, @now, @now)`,
    ).run({
      id,
      name: input.name,
      topic: input.topic ?? null,
      icon: input.icon ?? null,
      isPrivate: input.isPrivate ? 1 : 0,
      createdBy: input.createdBy,
      now,
    });

    const addMember = db.prepare(
      `INSERT OR IGNORE INTO conversation_members (
         conversation_id, user_id, role, joined_at, last_read_at, is_muted, is_pinned
       ) VALUES (?, ?, ?, ?, ?, 0, 0)`,
    );

    addMember.run(id, input.createdBy, 'owner' satisfies MemberRole, now, now);
    for (const memberId of input.memberIds) {
      if (memberId === input.createdBy) continue;
      // `last_read_at = 0` so invitees see existing history as unread rather
      // than silently starting caught up.
      addMember.run(id, memberId, 'member' satisfies MemberRole, now, 0);
    }

    return id;
  });
}

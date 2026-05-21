import {
  createId,
  escapeHtml,
  LIMITS,
  truncate,
  type Message,
  type Reaction,
  type ReplyPreview,
  type SearchHit,
} from '@pachat/shared';
import { getDb, transaction } from '../db/index.js';
import {
  messageKindOf,
  toAttachment,
  type AttachmentRow,
  type MessageRow,
  type ReactionRow,
} from './rows.js';

/**
 * Message persistence and hydration.
 *
 * Hydration is always batched: one query per related table for a whole page of
 * messages, never one per message. A 50-message scrollback page therefore
 * costs four statements regardless of how many reactions or attachments it
 * contains.
 */

/* ──────────────────────────────────────────────────────────── hydration ────*/

function placeholders(count: number): string {
  return new Array(count).fill('?').join(', ');
}

/** Groups reaction rows into the aggregated per-emoji shape the client wants. */
function aggregateReactions(rows: ReactionRow[]): Map<string, Reaction[]> {
  const byMessage = new Map<string, Map<string, Reaction>>();

  for (const row of rows) {
    let emojis = byMessage.get(row.message_id);
    if (!emojis) {
      emojis = new Map();
      byMessage.set(row.message_id, emojis);
    }
    let reaction = emojis.get(row.emoji);
    if (!reaction) {
      reaction = { emoji: row.emoji, count: 0, userIds: [] };
      emojis.set(row.emoji, reaction);
    }
    reaction.count += 1;
    reaction.userIds.push(row.user_id);
  }

  const result = new Map<string, Reaction[]>();
  for (const [messageId, emojis] of byMessage) {
    // Most-reacted first, then alphabetically, so the order is stable across
    // clients and does not jitter as reactions arrive.
    const list = [...emojis.values()].sort(
      (a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji),
    );
    result.set(messageId, list.slice(0, LIMITS.reactionsPerMessage));
  }
  return result;
}

function buildReplyPreview(parent: MessageRow): ReplyPreview {
  return {
    id: parent.id,
    authorId: parent.author_id,
    excerpt: parent.deleted_at ? 'Message deleted' : truncate(parent.body, 140),
    isDeleted: parent.deleted_at !== null,
  };
}

/** Lifts raw rows into fully populated domain messages, oldest-first. */
export function hydrateMessages(rows: MessageRow[]): Message[] {
  if (rows.length === 0) return [];
  const db = getDb();
  const ids = rows.map((r) => r.id);

  const reactionRows = db
    .prepare(
      `SELECT * FROM reactions
        WHERE message_id IN (${placeholders(ids.length)})
        ORDER BY created_at ASC`,
    )
    .all(...ids) as ReactionRow[];
  const reactions = aggregateReactions(reactionRows);

  const attachmentRows = db
    .prepare(
      `SELECT * FROM attachments
        WHERE message_id IN (${placeholders(ids.length)})
        ORDER BY created_at ASC`,
    )
    .all(...ids) as AttachmentRow[];

  const attachments = new Map<string, AttachmentRow[]>();
  for (const row of attachmentRows) {
    if (!row.message_id) continue;
    const list = attachments.get(row.message_id) ?? [];
    list.push(row);
    attachments.set(row.message_id, list);
  }

  const parentIds = [...new Set(rows.map((r) => r.reply_to_id).filter((v): v is string => !!v))];
  const parents = new Map<string, MessageRow>();
  if (parentIds.length > 0) {
    const parentRows = db
      .prepare(`SELECT * FROM messages WHERE id IN (${placeholders(parentIds.length)})`)
      .all(...parentIds) as MessageRow[];
    for (const row of parentRows) parents.set(row.id, row);
  }

  return rows.map((row) => {
    const parent = row.reply_to_id ? parents.get(row.reply_to_id) : undefined;
    return {
      id: row.id,
      conversationId: row.conversation_id,
      authorId: row.author_id,
      kind: messageKindOf(row),
      // A tombstoned message keeps its slot in history but loses its content,
      // so surrounding grouping and read cursors stay correct.
      body: row.deleted_at ? '' : row.body,
      attachments: row.deleted_at ? [] : (attachments.get(row.id) ?? []).map(toAttachment),
      reactions: row.deleted_at ? [] : (reactions.get(row.id) ?? []),
      replyTo: parent ? buildReplyPreview(parent) : null,
      createdAt: row.created_at,
      editedAt: row.edited_at,
      deletedAt: row.deleted_at,
    };
  });
}

export function findMessageRow(id: string): MessageRow | null {
  const row = getDb().prepare('SELECT * FROM messages WHERE id = ?').get(id) as
    MessageRow | undefined;
  return row ?? null;
}

export function getMessage(id: string): Message | null {
  const row = findMessageRow(id);
  if (!row) return null;
  return hydrateMessages([row])[0] ?? null;
}

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

/* ───────────────────────────────────────────────────────────── creation ────*/

export interface InsertMessageInput {
  conversationId: string;
  authorId: string;
  body: string;
  kind?: 'text' | 'system';
  replyToId?: string | null;
  nonce?: string | null;
  attachmentIds?: string[];
}

export interface InsertResult {
  message: Message;
  /** True when an existing row was returned because the nonce was a replay. */
  deduplicated: boolean;
}

/**
 * Inserts a message, claims its attachments and bumps the conversation's
 * `updated_at` — atomically.
 *
 * Idempotency: the unique `(author_id, nonce)` index means a client that
 * retries a send after a flaky reconnect gets the original message back
 * instead of a duplicate. The check is done inside the transaction, so two
 * concurrent retries cannot both win.
 */
export function insertMessage(input: InsertMessageInput): InsertResult {
  return transaction((db) => {
    if (input.nonce) {
      const existing = db
        .prepare('SELECT * FROM messages WHERE author_id = ? AND nonce = ?')
        .get(input.authorId, input.nonce) as MessageRow | undefined;
      if (existing) {
        const message = hydrateMessages([existing])[0];
        if (message) return { message, deduplicated: true };
      }
    }

    const now = Date.now();
    const id = createId(now);

    db.prepare(
      `INSERT INTO messages (
         id, conversation_id, author_id, kind, body, reply_to_id, nonce, created_at
       ) VALUES (@id, @conversationId, @authorId, @kind, @body, @replyToId, @nonce, @now)`,
    ).run({
      id,
      conversationId: input.conversationId,
      authorId: input.authorId,
      kind: input.kind ?? 'text',
      body: input.body,
      replyToId: input.replyToId ?? null,
      nonce: input.nonce ?? null,
      now,
    });

    const attachmentIds = input.attachmentIds ?? [];
    if (attachmentIds.length > 0) {
      // Attachments are uploaded before the message exists, so they start
      // unowned. Binding requires `message_id IS NULL` and a matching owner,
      // which stops one member attaching another member's upload.
      const claim = db.prepare(
        `UPDATE attachments
            SET message_id = @messageId
          WHERE id = @id AND owner_id = @ownerId AND message_id IS NULL`,
      );
      for (const attachmentId of attachmentIds) {
        claim.run({ messageId: id, id: attachmentId, ownerId: input.authorId });
      }
    }

    db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(
      now,
      input.conversationId,
    );

    const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as MessageRow;
    const message = hydrateMessages([row])[0];
    if (!message) throw new Error('message vanished immediately after insert');
    return { message, deduplicated: false };
  });
}

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

/* ───────────────────────────────────────────────────────────── mutation ────*/

export function editMessage(id: string, body: string): Message | null {
  const now = Date.now();
  getDb()
    .prepare('UPDATE messages SET body = ?, edited_at = ? WHERE id = ? AND deleted_at IS NULL')
    .run(body, now, id);
  return getMessage(id);
}

/**
 * Soft-deletes a message: the row survives as a tombstone, while its body,
 * reactions and attachments are removed. Keeping the row means reply previews
 * and read cursors that point at it stay resolvable.
 */
export function deleteMessage(id: string): Message | null {
  return transaction((db) => {
    const now = Date.now();
    db.prepare(`UPDATE messages SET deleted_at = ?, body = '' WHERE id = ?`).run(now, id);
    db.prepare('DELETE FROM reactions WHERE message_id = ?').run(id);
    db.prepare('DELETE FROM attachments WHERE message_id = ?').run(id);
    const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as MessageRow | undefined;
    return row ? (hydrateMessages([row])[0] ?? null) : null;
  });
}

/**
 * Toggles one member's reaction. Returns the rehydrated message so the caller
 * can broadcast a single authoritative state rather than a delta the clients
 * have to apply in order.
 */
export function toggleReaction(messageId: string, userId: string, emoji: string): Message | null {
  return transaction((db) => {
    const existing = db
      .prepare('SELECT 1 AS hit FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?')
      .get(messageId, userId, emoji) as { hit: number } | undefined;

    if (existing) {
      db.prepare('DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?').run(
        messageId,
        userId,
        emoji,
      );
    } else {
      const distinct = db
        .prepare('SELECT COUNT(DISTINCT emoji) AS n FROM reactions WHERE message_id = ?')
        .get(messageId) as { n: number };
      if (distinct.n >= LIMITS.reactionsPerMessage) {
        // Silently ignore rather than error: the cap exists to bound payload
        // size, and a failed toast for a reaction is worse than a no-op.
        const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as
          MessageRow | undefined;
        return row ? (hydrateMessages([row])[0] ?? null) : null;
      }
      db.prepare(
        'INSERT INTO reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)',
      ).run(messageId, userId, emoji, Date.now());
    }

    const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as
      MessageRow | undefined;
    return row ? (hydrateMessages([row])[0] ?? null) : null;
  });
}

/* ─────────────────────────────────────────────────────────── retrieval ────*/

export interface HistoryQuery {
  conversationId: string;
  /** Return messages strictly older than this id. */
  before?: string | null;
  limit?: number;
}

export interface HistoryResult {
  messages: Message[];
  hasMore: boolean;
}

/**
 * Keyset pagination over the time-prefixed primary key.
 *
 * `WHERE id < ?` is both the filter and the sort, served entirely by the
 * `(conversation_id, id DESC)` index. Unlike `OFFSET`, the cursor stays
 * correct while new messages arrive mid-scroll.
 */
export function listHistory(query: HistoryQuery): HistoryResult {
  const limit = Math.min(query.limit ?? LIMITS.messagePageSize, LIMITS.messagePageSizeMax);

  // Fetch one extra row purely to answer "is there more?" without a COUNT.
  const rows = query.before
    ? (getDb()
        .prepare(
          `SELECT * FROM messages
            WHERE conversation_id = ? AND id < ?
            ORDER BY id DESC LIMIT ?`,
        )
        .all(query.conversationId, query.before, limit + 1) as MessageRow[])
    : (getDb()
        .prepare(
          `SELECT * FROM messages
            WHERE conversation_id = ?
            ORDER BY id DESC LIMIT ?`,
        )
        .all(query.conversationId, limit + 1) as MessageRow[]);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  // Reverse to oldest-first: the renderer prepends pages, and reading order
  // should match render order.
  return { messages: hydrateMessages(page.reverse()), hasMore };
}

export function lastMessageOf(conversationId: string): Message | null {
  const row = getDb()
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1')
    .get(conversationId) as MessageRow | undefined;
  return row ? (hydrateMessages([row])[0] ?? null) : null;
}

/** Newest-message timestamp per conversation, for sidebar ordering. */
export function lastMessageTimestamps(conversationIds: string[]): Map<string, number> {
  if (conversationIds.length === 0) return new Map();
  const rows = getDb()
    .prepare(
      `SELECT conversation_id, MAX(created_at) AS newest
         FROM messages
        WHERE conversation_id IN (${placeholders(conversationIds.length)})
        GROUP BY conversation_id`,
    )
    .all(...conversationIds) as Array<{ conversation_id: string; newest: number }>;
  return new Map(rows.map((r) => [r.conversation_id, r.newest]));
}

/* ────────────────────────────────────────────────────────────── search ────*/

/**
 * Escapes a user query for FTS5. Each whitespace-separated term becomes a
 * quoted prefix match, which gives incremental "search as you type" behaviour
 * while making it impossible for a stray quote or operator to be interpreted
 * as FTS syntax.
 */
function toFtsQuery(input: string): string {
  const terms = input
    .split(/\s+/)
    .map((term) => term.replace(/["^*():]/g, '').trim())
    .filter((term) => term.length > 0);
  if (terms.length === 0) return '';
  return terms.map((term) => `"${term}"*`).join(' AND ');
}

/** Wraps matched terms in `<mark>` over HTML-escaped text. */
function highlight(body: string, terms: string[]): string {
  let output = escapeHtml(truncate(body, 240));
  for (const term of terms) {
    const safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!safe) continue;
    output = output.replace(new RegExp(`(${safe})`, 'gi'), '<mark>$1</mark>');
  }
  return output;
}

export interface SearchQuery {
  userId: string;
  query: string;
  conversationId?: string | null;
  limit?: number;
}

/**
 * Full-text search scoped to the conversations the caller belongs to. The
 * membership subquery is the authorisation boundary — there is no code path
 * that can return a message from a channel the viewer is not in.
 */
export function searchMessages(query: SearchQuery): SearchHit[] {
  const match = toFtsQuery(query.query);
  if (!match) return [];

  const limit = Math.min(query.limit ?? 25, 50);
  const db = getDb();

  const sql = `
    SELECT m.*
      FROM messages_fts f
      JOIN messages m ON m.rowid = f.rowid
     WHERE messages_fts MATCH @match
       AND m.deleted_at IS NULL
       AND m.conversation_id IN (
             SELECT conversation_id FROM conversation_members WHERE user_id = @userId
           )
       ${query.conversationId ? 'AND m.conversation_id = @conversationId' : ''}
     ORDER BY bm25(messages_fts) ASC, m.id DESC
     LIMIT @limit
  `;

  const params: Record<string, unknown> = { match, userId: query.userId, limit };
  if (query.conversationId) params.conversationId = query.conversationId;

  const rows = db.prepare(sql).all(params) as MessageRow[];
  const messages = hydrateMessages(rows);
  const terms = query.query.split(/\s+/).filter(Boolean);

  return messages.map((message) => ({
    message,
    highlight: highlight(message.body, terms),
  }));
}

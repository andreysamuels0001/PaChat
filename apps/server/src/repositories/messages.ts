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

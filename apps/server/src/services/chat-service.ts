import {
  LIMITS,
  PROTOCOL_VERSION,
  TIMINGS,
  type AdvanceReadInput,
  type Conversation,
  type CreateChannelInput,
  type DeleteMessageInput,
  type EditMessageInput,
  type FetchHistoryInput,
  type HistoryPage,
  type Message,
  type ReactInput,
  type ReadReceipt,
  type SearchHit,
  type SearchInput,
  type SendMessageInput,
  type SessionReady,
  type ToggleConversationFlagInput,
} from '@pachat/shared';
import { conflict, forbidden, notFound, validationFailed } from '../lib/errors.js';
import { createLogger } from '../lib/logger.js';
import * as conversations from '../repositories/conversations.js';
import * as messages from '../repositories/messages.js';
import * as users from '../repositories/users.js';
import { selfFor } from './auth-service.js';

const log = createLogger('chat');

export interface Viewer {
  id: string;
  username: string;
}

/* ───────────────────────────────────────────────────────── authorisation ───*/

/**
 * The single membership gate. Every handler that touches a conversation goes
 * through here, so "can this member see this?" is answered in exactly one
 * place rather than re-derived per endpoint.
 */
function assertMember(conversationId: string, viewer: Viewer): void {
  if (!conversations.findConversationRow(conversationId)) {
    throw notFound('That conversation does not exist');
  }
  if (!conversations.isMember(conversationId, viewer.id)) {
    throw forbidden('You are not a member of that conversation');
  }
}

function requireConversation(conversationId: string, viewer: Viewer): Conversation {
  const conversation = conversations.getForViewer(conversationId, viewer);
  if (!conversation) throw notFound('That conversation does not exist');
  return conversation;
}

/* ─────────────────────────────────────────────────────────────── bootstrap ─*/

/**
 * Builds the one-shot payload sent immediately after a successful handshake.
 *
 * Everything the first screen needs arrives in a single frame: the viewer, all
 * their conversations with unread state and last-message previews, and every
 * member they can see. No launch-time request waterfall.
 */
export function bootstrap(viewer: Viewer): SessionReady {
  return {
    self: selfFor(viewer.id),
    conversations: conversations.listForViewer(viewer),
    users: users.listVisibleUsers(viewer.id),
    serverTime: Date.now(),
    protocolVersion: PROTOCOL_VERSION,
  };
}

/* ───────────────────────────────────────────────────────────────── history ─*/

export function openConversation(viewer: Viewer, conversationId: string): HistoryPage {
  assertMember(conversationId, viewer);
  const { messages: page, hasMore } = messages.listHistory({ conversationId });
  return { conversationId, messages: page, hasMore };
}

export function fetchHistory(viewer: Viewer, input: FetchHistoryInput): HistoryPage {
  assertMember(input.conversationId, viewer);
  const { messages: page, hasMore } = messages.listHistory({
    conversationId: input.conversationId,
    before: input.before ?? null,
    limit: input.limit ?? LIMITS.messagePageSize,
  });
  return { conversationId: input.conversationId, messages: page, hasMore };
}

/* ──────────────────────────────────────────────────────────────── messages ─*/

export interface SendResult {
  message: Message;
  /** Members who should receive the push, i.e. everyone in the conversation. */
  recipientIds: string[];
  /** True when the nonce matched an existing row — do not re-broadcast. */
  deduplicated: boolean;
}

export function sendMessage(viewer: Viewer, input: SendMessageInput): SendResult {
  assertMember(input.conversationId, viewer);

  const body = input.body.trim();
  const attachmentIds = input.attachmentIds ?? [];

  if (body.length === 0 && attachmentIds.length === 0) {
    throw validationFailed('A message needs text or an attachment', { body: 'Cannot be empty' });
  }

  if (input.replyToId) {
    const parent = messages.findMessageRow(input.replyToId);
    // A reply must point into the same conversation, otherwise a crafted
    // payload could quote a message from a channel the viewer cannot see.
    if (!parent || parent.conversation_id !== input.conversationId) {
      throw validationFailed('You can only reply to a message in this conversation', {
        replyToId: 'Not in this conversation',
      });
    }
  }

  const result = messages.insertMessage({
    conversationId: input.conversationId,
    authorId: viewer.id,
    body,
    replyToId: input.replyToId ?? null,
    nonce: input.nonce,
    attachmentIds,
  });

  if (result.deduplicated) {
    log.debug('duplicate send suppressed', { nonce: input.nonce, userId: viewer.id });
  }

  // Sending is an implicit read: the author has obviously seen their own
  // message, so advance their cursor rather than showing it back as unread.
  conversations.advanceRead(input.conversationId, viewer.id, result.message.createdAt);

  return {
    message: result.message,
    recipientIds: conversations.memberIdsOf(input.conversationId),
    deduplicated: result.deduplicated,
  };
}

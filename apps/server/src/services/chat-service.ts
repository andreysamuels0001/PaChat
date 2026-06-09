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

export interface MutationResult {
  message: Message;
  recipientIds: string[];
}

export function editMessage(viewer: Viewer, input: EditMessageInput): MutationResult {
  const row = messages.findMessageRow(input.messageId);
  if (!row) throw notFound('That message no longer exists');
  assertMember(row.conversation_id, viewer);

  if (row.author_id !== viewer.id) throw forbidden('You can only edit your own messages');
  if (row.deleted_at) throw conflict('That message was deleted');
  if (row.kind !== 'text') throw forbidden('System messages cannot be edited');
  if (Date.now() - row.created_at > TIMINGS.messageEditWindowMs) {
    throw forbidden('Messages can only be edited within 24 hours of sending');
  }

  const body = input.body.trim();
  if (body.length === 0) {
    throw validationFailed('An edited message cannot be empty', { body: 'Cannot be empty' });
  }

  const message = messages.editMessage(input.messageId, body);
  if (!message) throw notFound('That message no longer exists');

  return { message, recipientIds: conversations.memberIdsOf(row.conversation_id) };
}

export function deleteMessage(viewer: Viewer, input: DeleteMessageInput): MutationResult {
  const row = messages.findMessageRow(input.messageId);
  if (!row) throw notFound('That message no longer exists');
  assertMember(row.conversation_id, viewer);

  // Authors delete their own messages; channel owners and admins may remove
  // anyone's, which is what makes moderation possible without a separate role
  // system.
  const member = conversations.memberRecord(row.conversation_id, viewer.id);
  const isModerator = member?.role === 'owner' || member?.role === 'admin';
  if (row.author_id !== viewer.id && !isModerator) {
    throw forbidden('You can only delete your own messages');
  }

  // Deleting twice is a no-op rather than an error: two clients racing on the
  // same message should both land on the same final state.
  const message = row.deleted_at
    ? messages.getMessage(input.messageId)
    : messages.deleteMessage(input.messageId);
  if (!message) throw notFound('That message no longer exists');

  log.debug('message deleted', { messageId: input.messageId, by: viewer.id });
  return { message, recipientIds: conversations.memberIdsOf(row.conversation_id) };
}

export function react(viewer: Viewer, input: ReactInput): MutationResult {
  const row = messages.findMessageRow(input.messageId);
  if (!row) throw notFound('That message no longer exists');
  assertMember(row.conversation_id, viewer);
  if (row.deleted_at) throw conflict('That message was deleted');

  const message = messages.toggleReaction(input.messageId, viewer.id, input.emoji);
  if (!message) throw notFound('That message no longer exists');

  return { message, recipientIds: conversations.memberIdsOf(row.conversation_id) };
}

/* ─────────────────────────────────────────────────────────── conversations ─*/

export interface ConversationResult {
  conversation: Conversation;
  /** Members who must be told the conversation exists / changed. */
  recipientIds: string[];
  /** True when the conversation was created by this call. */
  created: boolean;
}

export function createChannel(viewer: Viewer, input: CreateChannelInput): ConversationResult {
  const name = input.name.trim().toLowerCase().replace(/\s+/g, '-');

  if (name.length === 0) {
    throw validationFailed('A channel needs a name', { name: 'Cannot be empty' });
  }
  if (conversations.channelNameTaken(name)) {
    throw conflict(`#${name} already exists`, { name: 'Already taken' });
  }

  // Filter to real accounts so a bad id cannot create a membership row
  // pointing at nothing.
  const memberIds = [...new Set(input.memberIds ?? [])].filter(
    (id) => id !== viewer.id && users.findUserById(id) !== null,
  );

  const conversationId = conversations.createChannel({
    name,
    topic: input.topic ?? null,
    icon: input.icon ?? null,
    isPrivate: input.isPrivate ?? false,
    createdBy: viewer.id,
    memberIds,
  });

  // A system message gives the channel a visible origin instead of opening on
  // a blank screen.
  messages.insertMessage({
    conversationId,
    authorId: viewer.id,
    kind: 'system',
    body: `created #${name}`,
  });

  log.info('channel created', { conversationId, name, by: viewer.id });

  return {
    conversation: requireConversation(conversationId, viewer),
    recipientIds: [viewer.id, ...memberIds],
    created: true,
  };
}

export function openDirect(viewer: Viewer, peerId: string): ConversationResult {
  if (peerId === viewer.id) {
    throw validationFailed('You cannot open a direct message with yourself', {
      userId: 'Pick someone else',
    });
  }
  if (!users.findUserById(peerId)) throw notFound('That member does not exist');

  const existing = conversations.findDirectId(viewer.id, peerId);
  const conversationId = existing ?? conversations.findOrCreateDirect(viewer.id, peerId);

  return {
    conversation: requireConversation(conversationId, viewer),
    recipientIds: [viewer.id, peerId],
    created: existing === null,
  };
}

export function setConversationFlags(
  viewer: Viewer,
  input: ToggleConversationFlagInput,
): Conversation {
  assertMember(input.conversationId, viewer);
  const flags: { muted?: boolean; pinned?: boolean } = {};
  if (input.muted !== undefined) flags.muted = input.muted;
  if (input.pinned !== undefined) flags.pinned = input.pinned;
  conversations.setMemberFlags(input.conversationId, viewer.id, flags);
  return requireConversation(input.conversationId, viewer);
}

export interface LeaveResult {
  conversationId: string;
  /** Remaining members, who need the updated member list. */
  recipientIds: string[];
  systemMessage: Message | null;
}

export function leaveConversation(viewer: Viewer, conversationId: string): LeaveResult {
  assertMember(conversationId, viewer);

  const row = conversations.findConversationRow(conversationId);
  if (row?.kind === 'direct') {
    throw forbidden('Direct messages cannot be left — mute it instead');
  }

  const systemMessage = messages.insertMessage({
    conversationId,
    authorId: viewer.id,
    kind: 'system',
    body: 'left the channel',
  }).message;

  conversations.removeMember(conversationId, viewer.id);
  const remaining = conversations.memberIdsOf(conversationId);

  // An empty channel is dead weight — and the system message above would be
  // its only content.
  if (remaining.length === 0) conversations.deleteIfEmpty(conversationId);

  return { conversationId, recipientIds: remaining, systemMessage };
}

/* ────────────────────────────────────────────────────────────────── reads ──*/

export function advanceRead(viewer: Viewer, input: AdvanceReadInput): ReadReceipt {
  assertMember(input.conversationId, viewer);
  const lastReadAt = conversations.advanceRead(
    input.conversationId,
    viewer.id,
    // Never accept a cursor from the future: a client with a skewed clock
    // would otherwise mark messages it has not received as read.
    Math.min(input.readAt, Date.now()),
  );
  return { conversationId: input.conversationId, userId: viewer.id, lastReadAt };
}

/* ───────────────────────────────────────────────────────────────── search ──*/

export function search(viewer: Viewer, input: SearchInput): SearchHit[] {
  if (input.conversationId) assertMember(input.conversationId, viewer);
  return messages.searchMessages({
    userId: viewer.id,
    query: input.query,
    conversationId: input.conversationId ?? null,
    limit: input.limit ?? 25,
  });
}

/* ─────────────────────────────────────────────────────────────── rooms ────*/

/** Socket.IO room name for a conversation. */
export const roomFor = (conversationId: string): string => `conversation:${conversationId}`;

/** Socket.IO room name carrying all of one member's devices. */
export const userRoom = (userId: string): string => `user:${userId}`;

export const roomsForViewer = (viewer: Viewer): string[] => [
  userRoom(viewer.id),
  ...conversations.conversationIdsFor(viewer.id).map(roomFor),
];

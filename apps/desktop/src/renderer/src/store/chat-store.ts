import { create } from 'zustand';
import {
  createNonce,
  LIMITS,
  type Attachment,
  type Conversation,
  type ConversationMember,
  type Message,
  type ReadReceipt,
  type SearchHit,
  type User,
} from '@pachat/shared';

/**
 * The conversation cache.
 *
 * Normalised into maps keyed by id, so a pushed update touches one entry
 * instead of rewriting a list. Messages are kept as an ordered array per
 * conversation because the renderer needs positional context — grouping,
 * day separators and the unread divider all depend on neighbours.
 */

/** A message that exists only on this client until the server acknowledges it. */
export interface PendingMessage {
  nonce: string;
  conversationId: string;
  authorId: string;
  body: string;
  attachments: Attachment[];
  replyToId: string | null;
  createdAt: number;
  state: 'sending' | 'failed';
  error?: string;
}

interface HistoryState {
  loading: boolean;
  /** False once the start of the conversation has been reached. */
  hasMore: boolean;
  /** True once the first page has arrived, so empty state is distinguishable. */
  loaded: boolean;
}

interface ChatState {
  conversations: Map<string, Conversation>;
  messages: Map<string, Message[]>;
  users: Map<string, User>;
  typing: Map<string, string[]>;
  history: Map<string, HistoryState>;
  pending: PendingMessage[];
  drafts: Map<string, string>;
  activeConversationId: string | null;
  /**
   * Read cursor as it was when a conversation was opened. Frozen on purpose:
   * the "new messages" divider must stay put while the viewer reads, instead
   * of sliding down as each message is marked read.
   */
  unreadMarks: Map<string, number>;
  searchResults: SearchHit[];
  searchQuery: string;

  /* Server-driven mutations */
  applyBootstrap: (payload: { conversations: Conversation[]; users: User[] }) => void;
  upsertConversation: (conversation: Conversation) => void;
  removeConversation: (conversationId: string) => void;
  setMembers: (conversationId: string, members: ConversationMember[]) => void;
  upsertUser: (user: User) => void;
  receiveMessage: (message: Message, nonce?: string) => void;
  replaceMessage: (message: Message) => void;
  setTyping: (conversationId: string, userIds: string[]) => void;
  applyReceipt: (receipt: ReadReceipt) => void;
  prependHistory: (conversationId: string, messages: Message[], hasMore: boolean) => void;
  setHistoryLoading: (conversationId: string, loading: boolean) => void;

  /* Local mutations */
  setActive: (conversationId: string | null) => void;
  setDraft: (conversationId: string, draft: string) => void;
  addPending: (pending: PendingMessage) => void;
  failPending: (nonce: string, error: string) => void;
  dropPending: (nonce: string) => void;
  setSearch: (query: string, hits: SearchHit[]) => void;
  reset: () => void;
}

/** Inserts or replaces a message, keeping the array ordered by id. */
function mergeMessage(list: Message[], message: Message): Message[] {
  const index = list.findIndex((m) => m.id === message.id);
  if (index >= 0) {
    const next = list.slice();
    next[index] = message;
    return next;
  }

  // The common case is an append, so check the tail before scanning.
  if (list.length === 0 || list[list.length - 1]!.id < message.id) {
    return [...list, message];
  }

  const insertAt = list.findIndex((m) => m.id > message.id);
  const next = list.slice();
  next.splice(insertAt < 0 ? list.length : insertAt, 0, message);
  return next;
}

/** Caps retained history so a long-lived session cannot grow without bound. */
const MAX_RETAINED = 400;

function trim(list: Message[]): Message[] {
  return list.length > MAX_RETAINED ? list.slice(list.length - MAX_RETAINED) : list;
}

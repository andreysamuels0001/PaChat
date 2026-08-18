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

export const useChat = create<ChatState>()((set, get) => ({
  conversations: new Map(),
  messages: new Map(),
  users: new Map(),
  typing: new Map(),
  history: new Map(),
  pending: [],
  drafts: new Map(),
  activeConversationId: null,
  unreadMarks: new Map(),
  searchResults: [],
  searchQuery: '',

  applyBootstrap({ conversations, users }) {
    set({
      conversations: new Map(conversations.map((c) => [c.id, c])),
      users: new Map(users.map((u) => [u.id, u])),
    });
  },

  upsertConversation(conversation) {
    set((state) => {
      const next = new Map(state.conversations);
      next.set(conversation.id, conversation);
      return { conversations: next };
    });
  },

  removeConversation(conversationId) {
    set((state) => {
      const conversations = new Map(state.conversations);
      conversations.delete(conversationId);

      const messages = new Map(state.messages);
      messages.delete(conversationId);

      const history = new Map(state.history);
      history.delete(conversationId);

      return {
        conversations,
        messages,
        history,
        activeConversationId:
          state.activeConversationId === conversationId ? null : state.activeConversationId,
      };
    });
  },

  setMembers(conversationId, members) {
    set((state) => {
      const existing = state.conversations.get(conversationId);
      if (!existing) return {};
      const next = new Map(state.conversations);
      next.set(conversationId, { ...existing, members });
      return { conversations: next };
    });
  },

  upsertUser(user) {
    set((state) => {
      const next = new Map(state.users);
      next.set(user.id, user);
      return { users: next };
    });
  },

  receiveMessage(message, nonce) {
    set((state) => {
      const messages = new Map(state.messages);
      const list = messages.get(message.conversationId) ?? [];
      messages.set(message.conversationId, trim(mergeMessage(list, message)));

      // The optimistic bubble is dropped the moment the real one lands, so the
      // two never render simultaneously.
      const pending = nonce ? state.pending.filter((p) => p.nonce !== nonce) : state.pending;

      // A message from the author clears any lingering typing indicator for
      // them without waiting for the server's TTL.
      const typing = new Map(state.typing);
      const active = typing.get(message.conversationId);
      if (active?.includes(message.authorId)) {
        typing.set(
          message.conversationId,
          active.filter((id) => id !== message.authorId),
        );
      }

      return { messages, pending, typing };
    });
  },

  replaceMessage(message) {
    set((state) => {
      const list = state.messages.get(message.conversationId);
      if (!list) return {};
      const messages = new Map(state.messages);
      messages.set(message.conversationId, mergeMessage(list, message));
      return { messages };
    });
  },

  setTyping(conversationId, userIds) {
    set((state) => {
      const next = new Map(state.typing);
      if (userIds.length === 0) next.delete(conversationId);
      else next.set(conversationId, userIds);
      return { typing: next };
    });
  },

  applyReceipt(receipt) {
    set((state) => {
      const conversation = state.conversations.get(receipt.conversationId);
      if (!conversation) return {};

      const members = conversation.members.map((member) =>
        member.userId === receipt.userId
          ? { ...member, lastReadAt: Math.max(member.lastReadAt, receipt.lastReadAt) }
          : member,
      );

      const next = new Map(state.conversations);
      next.set(receipt.conversationId, { ...conversation, members });
      return { conversations: next };
    });
  },

  prependHistory(conversationId, incoming, hasMore) {
    set((state) => {
      const messages = new Map(state.messages);
      const existing = messages.get(conversationId) ?? [];

      // Deduplicate on merge: a page boundary can overlap with messages that
      // arrived live while the request was in flight.
      const seen = new Set(existing.map((m) => m.id));
      const fresh = incoming.filter((m) => !seen.has(m.id));
      messages.set(conversationId, [...fresh, ...existing]);

      const history = new Map(state.history);
      history.set(conversationId, { loading: false, hasMore, loaded: true });

      return { messages, history };
    });
  },

  setHistoryLoading(conversationId, loading) {
    set((state) => {
      const history = new Map(state.history);
      const current = history.get(conversationId) ?? { hasMore: true, loaded: false, loading };
      history.set(conversationId, { ...current, loading });
      return { history };
    });
  },

  setActive(conversationId) {
    const state = get();
    if (state.activeConversationId === conversationId) return;

    const unreadMarks = new Map(state.unreadMarks);

    if (conversationId) {
      const conversation = state.conversations.get(conversationId);
      // Freeze the divider position at the cursor as it stands right now.
      if (conversation && conversation.unreadCount > 0) {
        const self = conversation.members.find((m) => m.userId === currentUserId());
        if (self) unreadMarks.set(conversationId, self.lastReadAt);
      } else {
        unreadMarks.delete(conversationId);
      }
    }

    set({ activeConversationId: conversationId, unreadMarks, searchResults: [], searchQuery: '' });
  },

  setDraft(conversationId, draft) {
    set((state) => {
      const drafts = new Map(state.drafts);
      if (draft.length === 0) drafts.delete(conversationId);
      else drafts.set(conversationId, draft.slice(0, LIMITS.messageBody));
      return { drafts };
    });
  },

  addPending(pending) {
    set((state) => ({ pending: [...state.pending, pending] }));
  },

  failPending(nonce, error) {
    set((state) => ({
      pending: state.pending.map((p) =>
        p.nonce === nonce ? { ...p, state: 'failed' as const, error } : p,
      ),
    }));
  },

  dropPending(nonce) {
    set((state) => ({ pending: state.pending.filter((p) => p.nonce !== nonce) }));
  },

  setSearch(query, hits) {
    set({ searchQuery: query, searchResults: hits });
  },

  reset() {
    set({
      conversations: new Map(),
      messages: new Map(),
      users: new Map(),
      typing: new Map(),
      history: new Map(),
      pending: [],
      drafts: new Map(),
      activeConversationId: null,
      unreadMarks: new Map(),
      searchResults: [],
      searchQuery: '',
    });
  },
}));

/**
 * The signed-in member's id, read lazily to avoid a circular import between
 * the two stores at module-evaluation time.
 */
function currentUserId(): string | null {
  return (globalThis as { __pachatSelfId?: string | null }).__pachatSelfId ?? null;
}

/** Published by the realtime layer whenever the session identity changes. */
export function publishSelfId(id: string | null): void {
  (globalThis as { __pachatSelfId?: string | null }).__pachatSelfId = id;
}

/* ──────────────────────────────────────────────────────────── selectors ────*/

export const makeNonce = createNonce;

/** Pinned first, then by most recent activity — matching the server's order. */
export function selectOrderedConversations(state: ChatState): Conversation[] {
  return [...state.conversations.values()].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    const aTime = a.lastMessage?.createdAt ?? a.updatedAt;
    const bTime = b.lastMessage?.createdAt ?? b.updatedAt;
    return bTime - aTime;
  });
}

export function selectActiveConversation(state: ChatState): Conversation | null {
  return state.activeConversationId
    ? (state.conversations.get(state.activeConversationId) ?? null)
    : null;
}

export function selectTotalUnread(state: ChatState): number {
  let total = 0;
  for (const conversation of state.conversations.values()) {
    if (!conversation.isMuted) total += conversation.unreadCount;
  }
  return total;
}

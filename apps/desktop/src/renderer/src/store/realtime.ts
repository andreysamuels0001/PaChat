import {
  conversationTitle,
  createNonce,
  LIMITS,
  messagePreview,
  TIMINGS,
  truncate,
  type Attachment,
  type Conversation,
  type CreateChannelInput,
  type Message,
  type Preferences,
  type SearchHit,
  type Self,
  type UpdateProfileInput,
  type User,
} from '@pachat/shared';
import { bridge } from '../lib/bridge';
import { RealtimeClient, RealtimeError, type ConnectionStatus } from '../lib/socket';
import { publishSelfId, useChat, type PendingMessage } from './chat-store';
import { useSession } from './session-store';
import { useUi } from './ui-store';

/**
 * The bridge between the socket and the stores.
 *
 * Server pushes are translated into store mutations here, and user intents are
 * exposed as plain async functions. Components therefore never touch the
 * socket: they call `sendMessage(...)` and read state, which keeps optimistic
 * updates, retries and failure handling in one place rather than spread across
 * the component tree.
 */

let client: RealtimeClient | null = null;
let unsubscribers: Array<() => void> = [];

/* ──────────────────────────────────────────────────────────── connection ───*/

export function startRealtime(): void {
  if (client) return;

  client = new RealtimeClient({
    resolveToken: () => useSession.getState().ensureAccessToken(),
    refreshToken: () => useSession.getState().forceRefresh(),
    onStatusChange: (status: ConnectionStatus) => {
      useSession.getState().setConnection(status);
      if (status === 'incompatible') {
        useUi.getState().toast({
          tone: 'danger',
          title: 'Update required',
          description: 'This server speaks a newer version of the PaChat protocol.',
        });
      }
    },
  });

  void client.connect().then((socket) => {
    if (!socket) return;
    bindServerEvents();
  });
}

export function stopRealtime(): void {
  for (const off of unsubscribers) off();
  unsubscribers = [];
  client?.disconnect();
  client = null;
  useChat.getState().reset();
  publishSelfId(null);
}

function requireClient(): RealtimeClient {
  if (!client) throw new RealtimeError({ code: 'INTERNAL_ERROR', message: 'Not connected' });
  return client;
}

/* ─────────────────────────────────────────────────────── inbound bindings ──*/

function bindServerEvents(): void {
  const socket = requireClient();
  const chat = useChat.getState;
  const session = useSession.getState;

  unsubscribers.push(
    socket.on('session:ready', (payload) => {
      publishSelfId(payload.self.id);
      session().patchSelf(payload.self);
      useUi.getState().applyPreferences(payload.self.preferences);
      chat().applyBootstrap({
        conversations: payload.conversations,
        users: payload.users,
      });

      // Reopen whatever the viewer was reading, or fall back to the most
      // recently active conversation so the app never lands on a blank pane.
      const current = chat().activeConversationId;
      const target = current ?? payload.conversations[0]?.id ?? null;
      if (target) void openConversation(target);
    }),

    socket.on('session:revoked', ({ reason }) => {
      useUi.getState().toast({ tone: 'warning', title: 'Signed out', description: reason });
      void session().signOut();
    }),

    socket.on('conversation:upserted', ({ conversation }) => {
      chat().upsertConversation(conversation);
      syncBadge();
    }),

    socket.on('conversation:removed', ({ conversationId }) => {
      chat().removeConversation(conversationId);
      syncBadge();
    }),

    socket.on('conversation:members', ({ conversationId, members }) => {
      chat().setMembers(conversationId, members);
    }),

    socket.on('user:upserted', ({ user }) => {
      chat().upsertUser(user);
      // The viewer's own record also carries their private preferences, which
      // must follow them across devices.
      const self = session().self;
      if (self && user.id === self.id) {
        session().patchSelf({ ...self, ...user } as Self);
      }
    }),

    socket.on('presence:changed', ({ userId, presence }) => {
      const existing = chat().users.get(userId);
      if (existing) chat().upsertUser({ ...existing, presence });
    }),

    socket.on('message:created', ({ message, nonce }) => {
      chat().receiveMessage(message, nonce);
      announce(message);
      // Reading a conversation that is already open should not accumulate
      // unread state behind the viewer's back.
      if (isViewing(message.conversationId) && useUi.getState().windowFocused) {
        void markRead(message.conversationId, message.createdAt);
      }
    }),

    socket.on('message:updated', ({ message }) => chat().replaceMessage(message)),
    socket.on('message:deleted', ({ message }) => chat().replaceMessage(message)),

    socket.on('typing:changed', ({ conversationId, userIds }) => {
      const selfId = session().self?.id;
      chat().setTyping(
        conversationId,
        userIds.filter((id) => id !== selfId),
      );
    }),

    socket.on('read:changed', (receipt) => chat().applyReceipt(receipt)),

    socket.on('server:error', (error) => {
      useUi.getState().toast({ tone: 'danger', title: 'Server error', description: error.message });
    }),
  );
}

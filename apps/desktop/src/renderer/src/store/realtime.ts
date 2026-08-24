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

const isViewing = (conversationId: string): boolean =>
  useChat.getState().activeConversationId === conversationId;

/* ───────────────────────────────────────────────────────── notifications ───*/

/**
 * Decides whether an incoming message deserves the user's attention.
 *
 * Four conditions must all hold: it is not the viewer's own message, the
 * conversation is not muted, the viewer is not already looking at it in a
 * focused window, and notifications are enabled. Anything less and a busy
 * channel becomes an unusable stream of toasts.
 */
function announce(message: Message): void {
  const session = useSession.getState();
  const chat = useChat.getState();
  const ui = useUi.getState();
  const self = session.self;

  if (!self || message.authorId === self.id) return;
  if (message.kind === 'system') return;

  const conversation = chat.conversations.get(message.conversationId);
  if (!conversation || conversation.isMuted) return;
  if (isViewing(message.conversationId) && ui.windowFocused) return;
  if (!self.preferences.desktopNotifications) return;

  const author = chat.users.get(message.authorId);
  const title =
    conversation.kind === 'direct'
      ? (author?.displayName ?? 'New message')
      : `#${conversation.name ?? 'channel'} · ${author?.displayName ?? 'Someone'}`;

  bridge.notifications.show({
    title,
    body: truncate(messagePreview(message) || 'Sent an attachment', 160),
    conversationId: message.conversationId,
    silent: !self.preferences.notificationSound,
  });

  syncBadge();
}

/** Mirrors the unread total onto the taskbar / dock badge. */
function syncBadge(): void {
  let total = 0;
  for (const conversation of useChat.getState().conversations.values()) {
    if (!conversation.isMuted) total += conversation.unreadCount;
  }
  bridge.badge.set(total);
}

/* ──────────────────────────────────────────────────────────────── intents ──*/

export async function openConversation(conversationId: string): Promise<void> {
  const chat = useChat.getState();
  chat.setActive(conversationId);

  const cached = chat.history.get(conversationId);
  if (cached?.loaded) {
    void markReadToLatest(conversationId);
    return;
  }

  chat.setHistoryLoading(conversationId, true);
  try {
    const page = await requireClient().request<{
      conversationId: string;
      messages: Message[];
      hasMore: boolean;
    }>('conversation:open', { conversationId });

    chat.prependHistory(page.conversationId, page.messages, page.hasMore);
    void markReadToLatest(conversationId);
  } catch (error) {
    chat.setHistoryLoading(conversationId, false);
    report(error, 'Could not open that conversation');
  }
}

/** Loads the page of history immediately above what is already rendered. */
export async function loadOlderMessages(conversationId: string): Promise<void> {
  const chat = useChat.getState();
  const state = chat.history.get(conversationId);
  if (state?.loading || state?.hasMore === false) return;

  const oldest = chat.messages.get(conversationId)?.[0];
  if (!oldest) return;

  chat.setHistoryLoading(conversationId, true);
  try {
    const page = await requireClient().request<{
      conversationId: string;
      messages: Message[];
      hasMore: boolean;
    }>('history:fetch', {
      conversationId,
      before: oldest.id,
      limit: LIMITS.messagePageSize,
    });
    chat.prependHistory(page.conversationId, page.messages, page.hasMore);
  } catch (error) {
    chat.setHistoryLoading(conversationId, false);
    report(error, 'Could not load earlier messages');
  }
}

export interface SendOptions {
  conversationId: string;
  body: string;
  attachments?: Attachment[];
  replyToId?: string | null;
}

/**
 * Sends a message optimistically.
 *
 * The bubble appears instantly as a `PendingMessage` keyed by a nonce; the
 * server echoes that nonce back on the real message, at which point the
 * placeholder is dropped. A failure leaves it in place marked `failed`, so the
 * text is never lost and `retrySend` can reuse the same nonce — making the
 * retry idempotent server-side.
 */
export async function sendMessage(options: SendOptions): Promise<void> {
  const session = useSession.getState();
  const chat = useChat.getState();
  const self = session.self;
  if (!self) return;

  const body = options.body.trim();
  const attachments = options.attachments ?? [];
  if (body.length === 0 && attachments.length === 0) return;

  const pending: PendingMessage = {
    nonce: createNonce(),
    conversationId: options.conversationId,
    authorId: self.id,
    body,
    attachments,
    replyToId: options.replyToId ?? null,
    createdAt: Date.now(),
    state: 'sending',
  };

  chat.addPending(pending);
  chat.setDraft(options.conversationId, '');
  useUi.getState().setReplyTo(null);

  await deliver(pending);
}

export async function retrySend(nonce: string): Promise<void> {
  const pending = useChat.getState().pending.find((p) => p.nonce === nonce);
  if (!pending) return;
  useChat.getState().failPending(nonce, '');
  await deliver({ ...pending, state: 'sending' });
}

async function deliver(pending: PendingMessage): Promise<void> {
  try {
    await requireClient().request<{ message: Message; nonce: string }>('message:send', {
      conversationId: pending.conversationId,
      nonce: pending.nonce,
      body: pending.body,
      replyToId: pending.replyToId,
      attachmentIds: pending.attachments.map((a) => a.id),
    });
    // The pending entry is removed by the `message:created` push, which also
    // carries the authoritative server timestamp and id.
  } catch (error) {
    const message =
      error instanceof RealtimeError ? error.message : 'Message could not be delivered';
    useChat.getState().failPending(pending.nonce, message);
  }
}

export function discardPending(nonce: string): void {
  useChat.getState().dropPending(nonce);
}

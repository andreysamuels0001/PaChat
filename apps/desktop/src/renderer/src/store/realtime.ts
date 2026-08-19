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

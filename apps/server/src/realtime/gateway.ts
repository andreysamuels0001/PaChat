import type { Server as HttpServer } from 'node:http';
import { Server, type Namespace, type Socket } from 'socket.io';
import {
  advanceReadSchema,
  createChannelSchema,
  deleteMessageSchema,
  editMessageSchema,
  fetchHistorySchema,
  handshakeSchema,
  ok,
  openConversationSchema,
  openDirectSchema,
  reactSchema,
  searchSchema,
  sendMessageSchema,
  setPresenceSchema,
  SOCKET_NAMESPACE,
  TIMINGS,
  toggleConversationFlagSchema,
  typingPingSchema,
  updatePreferencesSchema,
  updateProfileSchema,
  type Ack,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SocketData,
} from '@pachat/shared';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { AppError, publicShape, toAppError } from '../lib/errors.js';
import { createLogger } from '../lib/logger.js';
import { TokenBucketLimiter } from '../lib/rate-limit.js';
import { authenticate } from '../services/auth-service.js';
import * as chat from '../services/chat-service.js';
import * as presence from '../services/presence-service.js';
import * as typing from '../services/typing-service.js';
import * as conversations from '../repositories/conversations.js';
import * as users from '../repositories/users.js';

const log = createLogger('gateway');

export type PaChatServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

type PaChatSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

type PaChatNamespace = Namespace<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/**
 * Per-member budgets. Sends are the expensive path (a write plus fan-out), so
 * they get the tightest bucket; reactions and typing are cheap but easy to
 * spam from a loop, so they are capped generously rather than left open.
 */
const sendLimiter = new TokenBucketLimiter(10, 3);
const reactionLimiter = new TokenBucketLimiter(25, 8);
const typingLimiter = new TokenBucketLimiter(20, 5);

/**
 * Wraps a handler so that nothing can escape it uncaught.
 *
 * Every client→server event answers through an acknowledgement, so a failure
 * is delivered as data rather than as an exception that would tear down the
 * connection and lose every other subscription on it.
 */
async function respond<T>(
  ack: Ack<T> | undefined,
  context: { socket: PaChatSocket; event: string },
  work: () => T | Promise<T>,
): Promise<void> {
  try {
    const data = await work();
    ack?.(ok(data));
  } catch (error) {
    const appError = error instanceof ZodError ? toAppError(error) : toAppError(error);
    if (appError.isInternal) {
      log.error('handler failed', {
        err: error,
        event: context.event,
        user: context.socket.data.username,
      });
    } else {
      log.debug('handler rejected', {
        event: context.event,
        code: appError.code,
        message: appError.message,
      });
    }
    ack?.({ ok: false, error: publicShape(appError) });
  }
}

const viewerOf = (socket: PaChatSocket): chat.Viewer => ({
  id: socket.data.userId,
  username: socket.data.username,
});

/* ──────────────────────────────────────────────────────────────── gateway ──*/

export function createGateway(httpServer: HttpServer): PaChatServer {
  const io: PaChatServer = new Server(httpServer, {
    path: '/socket.io',
    // The chat namespace keeps application traffic off the default namespace,
    // which leaves room to add e.g. an admin namespace without colliding.
    cors: {
      origin: (origin, callback) => {
        if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
        callback(new Error('Origin not allowed'));
      },
      credentials: true,
    },
    pingInterval: TIMINGS.heartbeatIntervalMs,
    pingTimeout: 20_000,
    // Chat frames are small and highly compressible; per-message deflate costs
    // more CPU than it saves bandwidth at this payload size.
    perMessageDeflate: false,
    maxHttpBufferSize: 256 * 1024,
    connectionStateRecovery: {
      // Lets a brief drop (tunnel change, laptop sleep) resume the same socket
      // and replay missed frames instead of forcing a full re-bootstrap.
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: false,
    },
  });

  const namespace = io.of(SOCKET_NAMESPACE);

  /* ── Handshake ─────────────────────────────────────────────────────────── */

  namespace.use((socket, next) => {
    try {
      const handshake = handshakeSchema.parse(socket.handshake.auth);
      const principal = authenticate(handshake.token);

      socket.data = {
        userId: principal.userId,
        username: principal.username,
        sessionId: principal.sessionId,
        connectedAt: Date.now(),
      };

      log.debug('handshake accepted', {
        user: principal.username,
        client: `${handshake.client.name}/${handshake.client.version}`,
        platform: handshake.client.platform,
      });

      next();
    } catch (error) {
      const appError = toAppError(error);
      log.warn('handshake rejected', { code: appError.code, message: appError.message });
      // Socket.IO surfaces `err.data` to the client's `connect_error`, which
      // is how the renderer distinguishes "token expired, refresh and retry"
      // from "wrong protocol version, tell the user to update".
      const failure = new Error(appError.message) as Error & { data?: unknown };
      failure.data = publicShape(appError);
      next(failure);
    }
  });

  /* ── Connection ────────────────────────────────────────────────────────── */

  namespace.on('connection', (socket) => {
    const viewer = viewerOf(socket);

    // One room per conversation plus one per member. The member room is what
    // makes multi-device work: a change is pushed to every window the person
    // has open, not just the one that caused it.
    socket.join(chat.roomsForViewer(viewer));

    presence.attach(viewer.id, socket.id);

    try {
      socket.emit('session:ready', chat.bootstrap(viewer));
    } catch (error) {
      log.error('bootstrap failed', { err: error, user: viewer.username });
      socket.emit('server:error', publicShape(toAppError(error)));
      socket.disconnect(true);
      return;
    }

    log.info('connected', { user: viewer.username, sockets: presence.connectionCount() });

    registerHandlers(namespace, socket);

    socket.on('disconnect', (reason) => {
      typing.clearUser(viewer.id);
      presence.detach(viewer.id, socket.id);
      log.info('disconnected', { user: viewer.username, reason });
    });
  });

  /* ── Server-pushed fan-out ─────────────────────────────────────────────── */

  // Presence reaches exactly the people who can see the member: everyone who
  // shares at least one conversation with them, and all of their own devices.
  presence.onPresenceChange((userId, snapshot) => {
    const rooms = [
      chat.userRoom(userId),
      ...conversations.conversationIdsFor(userId).map(chat.roomFor),
    ];
    namespace.to(rooms).emit('presence:changed', { userId, presence: snapshot });

    const user = users.getPublicUser(userId);
    if (user) namespace.to(rooms).emit('user:upserted', { user });
  });

  typing.onTypingChange((conversationId, userIds) => {
    namespace.to(chat.roomFor(conversationId)).emit('typing:changed', { conversationId, userIds });
  });

  typing.startJanitor();

  return io;
}

/* ──────────────────────────────────────────────────────────────── handlers ─*/

function registerHandlers(namespace: PaChatNamespace, socket: PaChatSocket): void {
  const viewer = viewerOf(socket);
  const room = chat.roomFor;

  /** Broadcasts to a conversation room, including the caller's other devices. */
  const toConversation = (conversationId: string) => namespace.to(room(conversationId));

  /** Pushes an updated conversation projection to each member individually. */
  const pushConversation = (recipientIds: string[], conversationId: string): void => {
    for (const userId of recipientIds) {
      // Unread counts, mute and pin are per-member, so each recipient needs
      // their own projection — a single shared payload would be wrong for
      // everyone but the sender.
      const projection = conversations.getForViewer(conversationId, {
        id: userId,
        username: users.findUserById(userId)?.username ?? '',
      });
      if (projection) {
        namespace.to(chat.userRoom(userId)).emit('conversation:upserted', {
          conversation: projection,
        });
      }
    }
  };

  /* ── Conversations ─────────────────────────────────────────────────────── */

  socket.on('conversation:open', (input, ack) =>
    respond(ack, { socket, event: 'conversation:open' }, () => {
      const parsed = openConversationSchema.parse(input);
      return chat.openConversation(viewer, parsed.conversationId);
    }),
  );

  socket.on('history:fetch', (input, ack) =>
    respond(ack, { socket, event: 'history:fetch' }, () =>
      chat.fetchHistory(viewer, fetchHistorySchema.parse(input)),
    ),
  );

  socket.on('conversation:create', (input, ack) =>
    respond(ack, { socket, event: 'conversation:create' }, () => {
      const result = chat.createChannel(viewer, createChannelSchema.parse(input));

      // Pull every invited member's live sockets into the new room so they
      // receive messages without needing to reconnect.
      for (const userId of result.recipientIds) {
        namespace.in(chat.userRoom(userId)).socketsJoin(room(result.conversation.id));
      }
      pushConversation(result.recipientIds, result.conversation.id);

      return { conversation: result.conversation };
    }),
  );

  socket.on('conversation:direct', (input, ack) =>
    respond(ack, { socket, event: 'conversation:direct' }, () => {
      const parsed = openDirectSchema.parse(input);
      const result = chat.openDirect(viewer, parsed.userId);

      for (const userId of result.recipientIds) {
        namespace.in(chat.userRoom(userId)).socketsJoin(room(result.conversation.id));
      }
      if (result.created) pushConversation(result.recipientIds, result.conversation.id);

      return { conversation: result.conversation };
    }),
  );

  socket.on('conversation:flags', (input, ack) =>
    respond(ack, { socket, event: 'conversation:flags' }, () => {
      const conversation = chat.setConversationFlags(
        viewer,
        toggleConversationFlagSchema.parse(input),
      );
      // Mute and pin are private, so this update goes only to the member's own
      // devices — never to the rest of the channel.
      namespace.to(chat.userRoom(viewer.id)).emit('conversation:upserted', { conversation });
      return { conversation };
    }),
  );

  socket.on('conversation:leave', (input, ack) =>
    respond(ack, { socket, event: 'conversation:leave' }, () => {
      const parsed = openConversationSchema.parse(input);
      const result = chat.leaveConversation(viewer, parsed.conversationId);

      if (result.systemMessage) {
        toConversation(parsed.conversationId).emit('message:created', {
          message: result.systemMessage,
        });
      }

      namespace.in(chat.userRoom(viewer.id)).socketsLeave(room(parsed.conversationId));
      namespace.to(chat.userRoom(viewer.id)).emit('conversation:removed', {
        conversationId: parsed.conversationId,
      });

      toConversation(parsed.conversationId).emit('conversation:members', {
        conversationId: parsed.conversationId,
        members: conversations.membersOf(parsed.conversationId),
      });
      pushConversation(result.recipientIds, parsed.conversationId);

      return { conversationId: parsed.conversationId };
    }),
  );

  /* ── Messages ──────────────────────────────────────────────────────────── */

  socket.on('message:send', (input, ack) =>
    respond(ack, { socket, event: 'message:send' }, () => {
      if (!sendLimiter.tryConsume(viewer.id)) {
        throw new AppError('RATE_LIMITED', 'You are sending messages too quickly');
      }

      const parsed = sendMessageSchema.parse(input);
      const result = chat.sendMessage(viewer, parsed);

      // A deduplicated send is a retry of something already broadcast; the
      // ack alone reconciles the caller's optimistic bubble.
      if (!result.deduplicated) {
        toConversation(parsed.conversationId).emit('message:created', {
          message: result.message,
          nonce: parsed.nonce,
        });
        pushConversation(result.recipientIds, parsed.conversationId);
      }

      // Sending clears the author's own typing indicator immediately rather
      // than leaving it to expire.
      typing.stop(parsed.conversationId, viewer.id);

      return { message: result.message, nonce: parsed.nonce };
    }),
  );

  socket.on('message:edit', (input, ack) =>
    respond(ack, { socket, event: 'message:edit' }, () => {
      const result = chat.editMessage(viewer, editMessageSchema.parse(input));
      toConversation(result.message.conversationId).emit('message:updated', {
        message: result.message,
      });
      pushConversation(result.recipientIds, result.message.conversationId);
      return { message: result.message };
    }),
  );

  socket.on('message:delete', (input, ack) =>
    respond(ack, { socket, event: 'message:delete' }, () => {
      const result = chat.deleteMessage(viewer, deleteMessageSchema.parse(input));
      toConversation(result.message.conversationId).emit('message:deleted', {
        message: result.message,
      });
      pushConversation(result.recipientIds, result.message.conversationId);
      return { message: result.message };
    }),
  );

  socket.on('message:react', (input, ack) =>
    respond(ack, { socket, event: 'message:react' }, () => {
      if (!reactionLimiter.tryConsume(viewer.id)) {
        throw new AppError('RATE_LIMITED', 'Too many reactions at once');
      }
      const result = chat.react(viewer, reactSchema.parse(input));
      // Broadcast the whole rehydrated message, not a delta: clients then
      // converge on identical state regardless of arrival order.
      toConversation(result.message.conversationId).emit('message:updated', {
        message: result.message,
      });
      return { message: result.message };
    }),
  );

  /* ── Ephemeral signals ─────────────────────────────────────────────────── */

  socket.on('typing:ping', (input) => {
    // Fire-and-forget: no acknowledgement, and a malformed or over-budget ping
    // is dropped silently. A typing indicator is never worth an error toast.
    try {
      if (!typingLimiter.tryConsume(viewer.id)) return;

      const { conversationId, isTyping } = typingPingSchema.parse(input);
      if (!conversations.isMember(conversationId, viewer.id)) return;

      if (isTyping) typing.start(conversationId, viewer.id);
      else typing.stop(conversationId, viewer.id);
    } catch {
      /* ignored by design */
    }
  });

  socket.on('read:advance', (input, ack) =>
    respond(ack, { socket, event: 'read:advance' }, () => {
      const receipt = chat.advanceRead(viewer, advanceReadSchema.parse(input));

      // Other members see the cursor move; the member's own devices also need
      // the refreshed conversation so the unread badge clears everywhere.
      toConversation(receipt.conversationId).emit('read:changed', receipt);
      pushConversation([viewer.id], receipt.conversationId);

      return { receipt };
    }),
  );

  /* ── Identity ──────────────────────────────────────────────────────────── */

  socket.on('presence:set', (input, ack) =>
    respond(ack, { socket, event: 'presence:set' }, () => {
      const parsed = setPresenceSchema.parse(input);
      presence.declare(viewer.id, parsed.state, parsed.message ?? undefined);
      return { self: chat.bootstrap(viewer).self };
    }),
  );

  socket.on('profile:update', (input, ack) =>
    respond(ack, { socket, event: 'profile:update' }, () => {
      const parsed = updateProfileSchema.parse(input);
      const row = users.updateProfile(viewer.id, parsed);
      const user = users.getPublicUser(row.id);

      if (user) {
        const rooms = [
          chat.userRoom(viewer.id),
          ...conversations.conversationIdsFor(viewer.id).map(room),
        ];
        namespace.to(rooms).emit('user:upserted', { user });
      }

      return { self: chat.bootstrap(viewer).self };
    }),
  );

  socket.on('preferences:update', (input, ack) =>
    respond(ack, { socket, event: 'preferences:update' }, () => {
      const parsed = updatePreferencesSchema.parse(input);
      users.updatePreferences(viewer.id, parsed);

      const self = chat.bootstrap(viewer).self;
      // Preferences are private but shared across the member's devices, so a
      // theme change on the desktop follows them to a second window.
      namespace.to(chat.userRoom(viewer.id)).emit('user:upserted', {
        user: users.getPublicUser(viewer.id)!,
      });
      return { self };
    }),
  );

  /* ── Discovery ─────────────────────────────────────────────────────────── */

  socket.on('search:messages', (input, ack) =>
    respond(ack, { socket, event: 'search:messages' }, () => ({
      hits: chat.search(viewer, searchSchema.parse(input)),
    })),
  );

  socket.on('directory:list', (ack) =>
    respond(ack, { socket, event: 'directory:list' }, () => ({
      users: users.listDirectory(viewer.id),
    })),
  );
}

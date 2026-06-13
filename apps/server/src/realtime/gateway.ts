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

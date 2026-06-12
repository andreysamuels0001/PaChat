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

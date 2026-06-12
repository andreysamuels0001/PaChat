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

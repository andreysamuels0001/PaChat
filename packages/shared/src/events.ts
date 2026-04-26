import { z } from 'zod';
import { ERROR_CODES, LIMITS, PROTOCOL_VERSION } from './constants.js';
import {
  accentColorSchema,
  conversationSchema,
  idSchema,
  messageSchema,
  preferencesSchema,
  presenceStateSchema,
  selfSchema,
  timestampSchema,
  userSchema,
} from './domain.js';
import type {
  Conversation,
  ConversationMember,
  Message,
  ReadReceipt,
  Self,
  TypingState,
  User,
} from './domain.js';

/* ──────────────────────────────────────────────────────────────────────────────
 * Envelope
 * ────────────────────────────────────────────────────────────────────────────*/

export const wireErrorSchema = z.object({
  code: z.nativeEnum(ERROR_CODES),
  message: z.string(),
  /** Field-level detail for validation failures: `{ body: 'too long' }`. */
  fields: z.record(z.string()).optional(),
});
export type WireError = z.infer<typeof wireErrorSchema>;

/**
 * Every client→server event answers through a Node-style acknowledgement that
 * is either a success envelope or a typed error. Nothing throws across the
 * socket boundary, so one bad payload can never tear down a live connection.
 */
export type Ok<T> = { ok: true; data: T };
export type Err = { ok: false; error: WireError };
export type Result<T> = Ok<T> | Err;
export type Ack<T> = (result: Result<T>) => void;

export const ok = <T>(data: T): Ok<T> => ({ ok: true, data });
export const err = (
  code: WireError['code'],
  message: string,
  fields?: Record<string, string>,
): Err => ({ ok: false, error: fields ? { code, message, fields } : { code, message } });

/* ──────────────────────────────────────────────────────────────────────────────
 * Handshake
 * ────────────────────────────────────────────────────────────────────────────*/

export const handshakeSchema = z.object({
  /** Bearer access token issued by `POST /api/auth/login`. */
  token: z.string().min(1),
  protocolVersion: z.literal(PROTOCOL_VERSION),
  /** Reported for diagnostics only; never trusted for authorisation. */
  client: z.object({
    name: z.string().max(32),
    version: z.string().max(32),
    platform: z.string().max(32),
  }),
});
export type Handshake = z.infer<typeof handshakeSchema>;

/**
 * The single bootstrap payload pushed immediately after a successful handshake.
 * One frame carries everything the UI needs to paint a complete first screen —
 * no waterfall of follow-up requests on launch.
 */
export const sessionReadySchema = z.object({
  self: selfSchema,
  conversations: z.array(conversationSchema),
  /** Every user the viewer can see across their conversations. */
  users: z.array(userSchema),
  serverTime: timestampSchema,
  protocolVersion: z.literal(PROTOCOL_VERSION),
});
export type SessionReady = z.infer<typeof sessionReadySchema>;

/* ──────────────────────────────────────────────────────────────────────────────
 * Client → server payloads
 * ────────────────────────────────────────────────────────────────────────────*/

export const sendMessageSchema = z
  .object({
    conversationId: idSchema,
    /**
     * Client-generated idempotency key. The server echoes it on the created
     * message so an optimistic bubble can be reconciled instead of duplicated,
     * and a retried send after a flaky reconnect is a no-op.
     */
    nonce: z.string().min(8).max(64),
    body: z.string().max(LIMITS.messageBody),
    replyToId: idSchema.nullable().optional(),
    attachmentIds: z.array(idSchema).max(LIMITS.attachmentsPerMessage).optional(),
  })
  .refine((v) => v.body.trim().length > 0 || (v.attachmentIds?.length ?? 0) > 0, {
    message: 'a message needs text or at least one attachment',
    path: ['body'],
  });
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const editMessageSchema = z.object({
  messageId: idSchema,
  body: z.string().min(1).max(LIMITS.messageBody),
});
export type EditMessageInput = z.infer<typeof editMessageSchema>;

export const deleteMessageSchema = z.object({ messageId: idSchema });
export type DeleteMessageInput = z.infer<typeof deleteMessageSchema>;

export const reactSchema = z.object({
  messageId: idSchema,
  emoji: z.string().min(1).max(16),
});
export type ReactInput = z.infer<typeof reactSchema>;

export const openConversationSchema = z.object({ conversationId: idSchema });
export type OpenConversationInput = z.infer<typeof openConversationSchema>;

export const fetchHistorySchema = z.object({
  conversationId: idSchema,
  /** Cursor: return messages strictly older than this id. */
  before: idSchema.nullable().optional(),
  limit: z.number().int().min(1).max(LIMITS.messagePageSizeMax).optional(),
});
export type FetchHistoryInput = z.infer<typeof fetchHistorySchema>;

export const historyPageSchema = z.object({
  conversationId: idSchema,
  /** Oldest-first, ready to prepend to the rendered list. */
  messages: z.array(messageSchema),
  /** False once the caller has reached the start of the conversation. */
  hasMore: z.boolean(),
});
export type HistoryPage = z.infer<typeof historyPageSchema>;

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

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

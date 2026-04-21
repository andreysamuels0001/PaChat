import { z } from 'zod';
import { ACCENT_COLORS, LIMITS } from './constants.js';

/* ──────────────────────────────────────────────────────────────────────────────
 * Primitives
 * ────────────────────────────────────────────────────────────────────────────*/

/** Sortable, URL-safe 24-char identifier produced by `createId()`. */
export const idSchema = z
  .string()
  .regex(/^[0-9a-z]{20,28}$/, 'malformed identifier')
  .describe('Lexicographically sortable public identifier');

/** Epoch milliseconds. The wire format is always numeric — never a Date. */
export const timestampSchema = z.number().int().nonnegative();

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(LIMITS.usernameMin)
  .max(LIMITS.usernameMax)
  .regex(/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/, 'use letters, digits, dot, dash or underscore');

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const passwordSchema = z.string().min(LIMITS.passwordMin).max(LIMITS.passwordMax);

export const accentColorSchema = z.enum(ACCENT_COLORS);

import { z } from 'zod';
import {
  accentColorSchema,
  attachmentSchema,
  emailSchema,
  passwordSchema,
  selfSchema,
  usernameSchema,
} from './domain.js';
import { LIMITS } from './constants.js';

/**
 * The REST surface is deliberately small: credentials, token lifecycle and
 * binary uploads. Everything stateful flows over the socket, so the HTTP layer
 * stays cacheable, stateless and trivial to put behind a reverse proxy.
 */

export const API_PREFIX = '/api';

export const ROUTES = {
  health: `${API_PREFIX}/health`,
  register: `${API_PREFIX}/auth/register`,
  login: `${API_PREFIX}/auth/login`,
  refresh: `${API_PREFIX}/auth/refresh`,
  logout: `${API_PREFIX}/auth/logout`,
  me: `${API_PREFIX}/auth/me`,
  upload: `${API_PREFIX}/uploads`,
} as const;

/* ──────────────────────────────────────────────────────────────────────────── */

export const registerSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  displayName: z.string().trim().min(1).max(LIMITS.displayName),
  password: passwordSchema,
  accentColor: accentColorSchema.optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  /** Accepts either the email address or the username. */
  identifier: z.string().trim().min(3).max(254),
  password: passwordSchema,
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({ refreshToken: z.string().min(1) });
export type RefreshInput = z.infer<typeof refreshSchema>;

export const tokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** Absolute expiry of the access token, in epoch milliseconds. */
  accessExpiresAt: z.number().int(),
});
export type TokenPair = z.infer<typeof tokenPairSchema>;

export const authResponseSchema = z.object({
  self: selfSchema,
  tokens: tokenPairSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

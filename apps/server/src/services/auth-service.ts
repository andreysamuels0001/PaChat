import {
  accentFor,
  type AuthResponse,
  type LoginInput,
  type RegisterInput,
  type Self,
  type TokenPair,
} from '@pachat/shared';
import { env } from '../config/env.js';
import { conflict, forbidden, unauthorized } from '../lib/errors.js';
import { DECOY_HASH, hashPassword, verifyPassword } from '../lib/password.js';
import {
  createRefreshToken,
  digestRefreshToken,
  signAccessToken,
  verifyAccessToken,
  type AccessClaims,
} from '../lib/tokens.js';
import { createLogger } from '../lib/logger.js';
import { toSelf } from '../repositories/rows.js';
import * as sessions from '../repositories/sessions.js';
import * as users from '../repositories/users.js';

const log = createLogger('auth');

export interface DeviceContext {
  userAgent?: string | null;
  ip?: string | null;
}

function issueTokens(user: { id: string; username: string }, device: DeviceContext): TokenPair {
  const refresh = createRefreshToken();
  const session = sessions.createSession({
    userId: user.id,
    refreshTokenHash: refresh.digest,
    expiresAt: refresh.expiresAt,
    userAgent: device.userAgent ?? null,
    ip: device.ip ?? null,
  });

  const access = signAccessToken({ sub: user.id, sid: session.id, username: user.username });

  return {
    accessToken: access.token,
    refreshToken: refresh.token,
    accessExpiresAt: access.expiresAt,
  };
}

/* ─────────────────────────────────────────────────────────── registration ──*/

export async function register(input: RegisterInput, device: DeviceContext): Promise<AuthResponse> {
  if (!env.ALLOW_REGISTRATION) {
    throw forbidden('Registration is disabled on this server');
  }

  if (users.findUserByEmail(input.email)) {
    throw conflict('That email address is already registered', {
      email: 'Already registered',
    });
  }
  if (users.findUserByUsername(input.username)) {
    throw conflict('That username is taken', { username: 'Already taken' });
  }

  const row = users.createUser({
    email: input.email,
    username: input.username,
    displayName: input.displayName,
    passwordHash: await hashPassword(input.password),
    // A deterministic colour from the username means a new account looks
    // intentional on first render rather than defaulting to everyone's indigo.
    accentColor: input.accentColor ?? accentFor(input.username),
  });

  log.info('account created', { userId: row.id, username: row.username });

  return { self: toSelf(row), tokens: issueTokens(row, device) };
}

/* ────────────────────────────────────────────────────────────────── login ──*/

export async function login(input: LoginInput, device: DeviceContext): Promise<AuthResponse> {
  const row = users.findUserByIdentifier(input.identifier);

  // Hash against a decoy when the account does not exist so that a wrong
  // address and a wrong password take the same time. Without this, response
  // latency alone enumerates registered members.
  const matches = await verifyPassword(input.password, row?.password_hash ?? DECOY_HASH);

  if (!row || !matches) {
    log.warn('failed sign-in', { identifier: input.identifier, ip: device.ip ?? undefined });
    throw unauthorized('Those credentials do not match an account');
  }

  log.info('signed in', { userId: row.id, username: row.username });

  return { self: toSelf(row), tokens: issueTokens(row, device) };
}

/* ──────────────────────────────────────────────────────────────── refresh ──*/

/**
 * Exchanges a refresh token for a new pair, rotating the stored digest.
 *
 * Rotation is what bounds the damage of a stolen refresh token: the next use
 * by either party invalidates the other's copy, so a theft surfaces as an
 * unexpected sign-out rather than silent indefinite access.
 */
export function refresh(refreshToken: string): AuthResponse {
  const digest = digestRefreshToken(refreshToken);
  const session = sessions.findLiveSessionByDigest(digest);
  if (!session) throw unauthorized('Your session has expired — sign in again');

  const row = users.findUserById(session.user_id);
  if (!row) {
    sessions.revokeSession(session.id);
    throw unauthorized('Account no longer exists');
  }

  const next = createRefreshToken();
  sessions.rotateSession(session.id, next.digest, next.expiresAt);

  const access = signAccessToken({ sub: row.id, sid: session.id, username: row.username });

  return {
    self: toSelf(row),
    tokens: {
      accessToken: access.token,
      refreshToken: next.token,
      accessExpiresAt: access.expiresAt,
    },
  };
}

/* ───────────────────────────────────────────────────────────────── logout ──*/

export function logout(refreshToken: string): void {
  const session = sessions.findLiveSessionByDigest(digestRefreshToken(refreshToken));
  if (session) {
    sessions.revokeSession(session.id);
    log.info('signed out', { userId: session.user_id, sessionId: session.id });
  }
}

/* ─────────────────────────────────────────────────────────── verification ──*/

export interface Principal {
  userId: string;
  username: string;
  sessionId: string;
}

/**
 * Validates an access token and confirms its session is still live.
 *
 * The session check is the reason logout takes effect immediately rather than
 * at token expiry: a revoked device presenting a still-valid JWT is rejected
 * here.
 */
export function authenticate(accessToken: string): Principal {
  const claims: AccessClaims = verifyAccessToken(accessToken);

  if (!sessions.isSessionLive(claims.sid)) {
    throw unauthorized('This session was signed out');
  }
  if (!users.findUserById(claims.sub)) {
    throw unauthorized('Account no longer exists');
  }

  return { userId: claims.sub, username: claims.username, sessionId: claims.sid };
}

export function selfFor(userId: string): Self {
  const self = users.getSelf(userId);
  if (!self) throw unauthorized('Account no longer exists');
  return self;
}

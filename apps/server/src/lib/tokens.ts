import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { TIMINGS } from '@pachat/shared';
import { env } from '../config/env.js';
import { unauthorized } from './errors.js';

/**
 * Two-token session model.
 *
 * The access token is a short-lived, stateless JWT — it is what the socket
 * handshake carries, so the gateway can authenticate a connection without
 * touching the database. The refresh token is opaque, long-lived and stored
 * only as a SHA-256 digest, which means a database leak cannot be replayed
 * into live sessions, and logout can revoke a single device.
 */

export interface AccessClaims {
  /** User id. */
  sub: string;
  /** Session id — lets a single device be revoked without nuking the account. */
  sid: string;
  username: string;
}

export function signAccessToken(claims: AccessClaims): { token: string; expiresAt: number } {
  const expiresInSeconds = Math.floor(TIMINGS.accessTokenTtlMs / 1000);
  const token = jwt.sign(claims, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    expiresIn: expiresInSeconds,
    issuer: 'pachat',
    audience: 'pachat-desktop',
  });
  return { token, expiresAt: Date.now() + TIMINGS.accessTokenTtlMs };
}

export function verifyAccessToken(token: string): AccessClaims {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      issuer: 'pachat',
      audience: 'pachat-desktop',
    });
    if (typeof payload === 'string') throw unauthorized('Malformed access token');

    // Every field is re-checked rather than asserted: the signature proves the
    // token came from us, not that its shape matches the current claim type
    // (an older build may have signed it).
    const { sub, sid, username } = payload as Partial<AccessClaims>;
    if (typeof sub !== 'string' || typeof sid !== 'string' || typeof username !== 'string') {
      throw unauthorized('Malformed access token');
    }

    return { sub, sid, username };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) throw unauthorized('Session expired');
    if (error instanceof jwt.JsonWebTokenError) throw unauthorized('Invalid access token');
    throw error;
  }
}

/**
 * Mints a refresh token. The caller persists only `digest`; the raw value is
 * handed to the client once and never stored server-side.
 */
export function createRefreshToken(): { token: string; digest: string; expiresAt: number } {
  const token = randomBytes(48).toString('base64url');
  return {
    token,
    digest: digestRefreshToken(token),
    expiresAt: Date.now() + TIMINGS.refreshTokenTtlMs,
  };
}

export function digestRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Reads a bearer token out of an `Authorization` header value. */
export function bearerFrom(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  if (!value || scheme?.toLowerCase() !== 'bearer') return null;
  return value.trim() || null;
}

import { create } from 'zustand';
import type { LoginInput, RegisterInput, Self, TokenPair } from '@pachat/shared';
import { api, ApiRequestError } from '../lib/api';
import { bridge, SECRET_KEYS } from '../lib/bridge';
import type { ConnectionStatus } from '../lib/socket';

/**
 * Authentication and token lifecycle.
 *
 * The access token lives only in memory — it is short-lived and re-derivable,
 * so persisting it would widen the blast radius of a compromised profile for
 * no benefit. Only the refresh token is written, and only into the OS
 * credential vault via the preload bridge.
 */

export type SessionStatus =
  'booting' | 'unauthenticated' | 'authenticating' | 'authenticated' | 'signing-out';

interface SessionState {
  status: SessionStatus;
  self: Self | null;
  accessToken: string | null;
  refreshToken: string | null;
  accessExpiresAt: number;
  connection: ConnectionStatus;
  /** Last authentication failure, for display on the sign-in form. */
  error: { message: string; fields?: Record<string, string> } | null;
  /** Pre-filled identifier, remembered from the previous successful sign-in. */
  rememberedIdentifier: string | null;

  restore: () => Promise<void>;
  signIn: (input: LoginInput) => Promise<boolean>;
  signUp: (input: RegisterInput) => Promise<boolean>;
  signOut: () => Promise<void>;
  /** A valid access token, refreshed if it is close to expiry. */
  ensureAccessToken: () => Promise<string | null>;
  /** Forces a refresh — called when the server rejects the current token. */
  forceRefresh: () => Promise<string | null>;
  setConnection: (status: ConnectionStatus) => void;
  patchSelf: (self: Self) => void;
  clearError: () => void;
}

/** Refresh this far ahead of expiry so a request never races the boundary. */
const REFRESH_MARGIN_MS = 60_000;

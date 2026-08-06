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

export const useSession = create<SessionState>()((set, get) => {
  /** Shared across concurrent callers so only one refresh is ever in flight. */
  let inFlightRefresh: Promise<string | null> | null = null;

  const adopt = (payload: { self: Self; tokens: TokenPair }): void => {
    set({
      status: 'authenticated',
      self: payload.self,
      accessToken: payload.tokens.accessToken,
      refreshToken: payload.tokens.refreshToken,
      accessExpiresAt: payload.tokens.accessExpiresAt,
      error: null,
    });
    // Persisting is best-effort. On a machine with no secret service the write
    // is refused rather than downgraded to plaintext, and the session simply
    // does not survive a restart — which must not surface as an error here.
    void persistQuietly(SECRET_KEYS.refreshToken, payload.tokens.refreshToken);
    void persistQuietly(SECRET_KEYS.lastIdentifier, payload.self.email);
  };

  const forget = (): void => {
    set({
      status: 'unauthenticated',
      self: null,
      accessToken: null,
      refreshToken: null,
      accessExpiresAt: 0,
      connection: 'idle',
    });
    void bridge.secrets.delete(SECRET_KEYS.refreshToken).catch(() => undefined);
  };

  const persistQuietly = async (key: string, value: string): Promise<void> => {
    try {
      await bridge.secrets.set(key, value);
    } catch {
      /* no vault available — the user signs in again next launch */
    }
  };

  const describe = (error: unknown): { message: string; fields?: Record<string, string> } => {
    if (error instanceof ApiRequestError) {
      return error.fields
        ? { message: error.message, fields: error.fields }
        : { message: error.message };
    }
    return { message: 'Something went wrong. Please try again.' };
  };

  return {
    status: 'booting',
    self: null,
    accessToken: null,
    refreshToken: null,
    accessExpiresAt: 0,
    connection: 'idle',
    error: null,
    rememberedIdentifier: null,

    /**
     * Silent sign-in on launch. A stored refresh token is exchanged for a live
     * session so a returning user lands straight in their conversations
     * instead of on a login form.
     */
    async restore() {
      // Reading the vault must never be able to strand the app on the splash
      // screen. An unavailable secret service, a vault written by a different
      // OS user, or an IPC failure all mean "we have no stored session" — not
      // "stop here" — so every failure path falls through to the sign-in form.
      let stored: string | null = null;
      let identifier: string | null = null;

      try {
        [stored, identifier] = await Promise.all([
          bridge.secrets.get(SECRET_KEYS.refreshToken),
          bridge.secrets.get(SECRET_KEYS.lastIdentifier),
        ]);
      } catch {
        set({ status: 'unauthenticated' });
        return;
      }

      set({ rememberedIdentifier: identifier });

      if (!stored) {
        set({ status: 'unauthenticated' });
        return;
      }

      try {
        adopt(await api.refresh(stored));
      } catch (error) {
        // An unreachable server must not discard a valid token — the user is
        // offline, not signed out. Only an actual rejection clears it.
        if (error instanceof ApiRequestError && error.isOffline) {
          set({ status: 'unauthenticated', connection: 'offline', error: describe(error) });
          return;
        }
        forget();
      }
    },

    async signIn(input) {
      set({ status: 'authenticating', error: null });
      try {
        adopt(await api.login(input));
        return true;
      } catch (error) {
        set({ status: 'unauthenticated', error: describe(error) });
        return false;
      }
    },

    async signUp(input) {
      set({ status: 'authenticating', error: null });
      try {
        adopt(await api.register(input));
        return true;
      } catch (error) {
        set({ status: 'unauthenticated', error: describe(error) });
        return false;
      }
    },

    async signOut() {
      const token = get().refreshToken;
      set({ status: 'signing-out' });
      // Revoke server-side first so the session dies even if the window is
      // closed immediately afterwards; a failure here is non-fatal.
      if (token) {
        try {
          await api.logout(token);
        } catch {
          /* already invalid, or offline */
        }
      }
      forget();
    },

    async ensureAccessToken() {
      const { accessToken, accessExpiresAt } = get();
      if (accessToken && Date.now() < accessExpiresAt - REFRESH_MARGIN_MS) return accessToken;
      return get().forceRefresh();
    },

    async forceRefresh() {
      inFlightRefresh ??= (async () => {
        try {
          let stored = get().refreshToken;

          if (!stored) {
            try {
              stored = await bridge.secrets.get(SECRET_KEYS.refreshToken);
            } catch {
              stored = null;
            }
          }

          if (!stored) {
            forget();
            return null;
          }

          const payload = await api.refresh(stored);
          adopt(payload);
          return payload.tokens.accessToken;
        } catch (error) {
          if (!(error instanceof ApiRequestError && error.isOffline)) forget();
          return null;
        } finally {
          // Released in `finally`, and the whole body is inside the `try`, so
          // the slot can never latch. A rejected promise left here would block
          // every future reauthentication attempt for the life of the window.
          inFlightRefresh = null;
        }
      })();

      return inFlightRefresh;
    },

    setConnection(status) {
      set({ connection: status });
      if (status === 'unauthorised') forget();
    },

    patchSelf(self) {
      set({ self });
    },

    clearError() {
      set({ error: null });
    },
  };
});

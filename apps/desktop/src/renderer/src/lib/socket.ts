import { io, type Socket } from 'socket.io-client';
import {
  PROTOCOL_VERSION,
  SOCKET_NAMESPACE,
  type ClientToServerEvents,
  type Result,
  type ServerToClientEvents,
  type WireError,
} from '@pachat/shared';
import { bridge } from './bridge';

/**
 * The realtime transport.
 *
 * Wraps Socket.IO in three ways that matter to the rest of the app:
 *
 *  1. `request()` turns the callback-style acknowledgement into a promise that
 *     resolves with data or rejects with a typed `WireError`, so handlers read
 *     like ordinary async calls.
 *  2. Connection state is surfaced as a single enum the UI can render, rather
 *     than a set of boolean flags callers have to combine themselves.
 *  3. An expired access token is detected from `connect_error` and refreshed
 *     before retrying, which is what makes the app survive being left open
 *     overnight.
 */

export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'unauthorised'
  | 'offline'
  | 'incompatible';

export class RealtimeError extends Error {
  readonly code: WireError['code'];
  readonly fields?: Record<string, string>;

  constructor(error: WireError) {
    super(error.message);
    this.name = 'RealtimeError';
    this.code = error.code;
    if (error.fields) this.fields = error.fields;
  }
}

type PaChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** The one untyped seam: see `request()` for why it is needed. */
interface LooseEmitter {
  emit(event: string, ...args: unknown[]): void;
}

export interface RealtimeOptions {
  /** Returns a usable access token, refreshing it if necessary. */
  resolveToken: () => Promise<string | null>;
  /** Forces a token refresh after the server rejected the current one. */
  refreshToken: () => Promise<string | null>;
  onStatusChange: (status: ConnectionStatus) => void;
}

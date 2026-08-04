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

/** Acknowledgement deadline. Beyond this the server is not going to answer. */
const ACK_TIMEOUT_MS = 12_000;

export class RealtimeClient {
  private socket: PaChatSocket | null = null;
  private status: ConnectionStatus = 'idle';
  private readonly options: RealtimeOptions;
  /** Guards against two refresh attempts racing on a single rejection. */
  private refreshing: Promise<string | null> | null = null;

  constructor(options: RealtimeOptions) {
    this.options = options;
  }

  get connected(): boolean {
    return this.socket?.connected ?? false;
  }

  get currentStatus(): ConnectionStatus {
    return this.status;
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.options.onStatusChange(status);
  }

  /* ── Lifecycle ─────────────────────────────────────────────────────────── */

  async connect(): Promise<PaChatSocket | null> {
    if (this.socket) return this.socket;

    const token = await this.options.resolveToken();
    if (!token) {
      this.setStatus('unauthorised');
      return null;
    }

    this.setStatus('connecting');

    const socket: PaChatSocket = io(`${bridge.info.serverUrl}${SOCKET_NAMESPACE}`, {
      transports: ['websocket'],
      auth: {
        token,
        protocolVersion: PROTOCOL_VERSION,
        client: {
          name: 'pachat-desktop',
          version: bridge.info.version,
          platform: bridge.info.platform,
        },
      },
      // Exponential-ish backoff with jitter, capped so a server restart is
      // picked up within a few seconds rather than minutes.
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 600,
      reconnectionDelayMax: 8_000,
      randomizationFactor: 0.4,
      timeout: 10_000,
      autoConnect: true,
    });

    this.socket = socket;
    this.wireLifecycle(socket);
    return socket;
  }

  private wireLifecycle(socket: PaChatSocket): void {
    socket.on('connect', () => this.setStatus('connected'));

    socket.on('disconnect', (reason) => {
      // An explicit client-side disconnect is a sign-out, not a fault.
      if (reason === 'io client disconnect') {
        this.setStatus('idle');
        return;
      }
      this.setStatus('reconnecting');
    });

    socket.io.on('reconnect_attempt', () => {
      if (this.status !== 'unauthorised') this.setStatus('reconnecting');
    });

    socket.on('connect_error', (error: Error & { data?: WireError }) => {
      const code = error.data?.code;

      if (code === 'PROTOCOL_MISMATCH') {
        // The installed build cannot speak to this server. Retrying forever
        // would be pointless, so stop and let the UI ask for an update.
        this.setStatus('incompatible');
        socket.disconnect();
        return;
      }

      if (code === 'UNAUTHORIZED') {
        void this.reauthenticate(socket);
        return;
      }

      this.setStatus(socket.active ? 'reconnecting' : 'offline');
    });
  }

  /**
   * Refreshes the access token and re-attempts the handshake.
   *
   * Socket.IO re-sends `auth` on every reconnect attempt, so replacing the
   * token in place is enough — the next automatic attempt carries the new one.
   */
  private async reauthenticate(socket: PaChatSocket): Promise<void> {
    this.refreshing ??= this.options.refreshToken().finally(() => {
      this.refreshing = null;
    });

    const token = await this.refreshing;

    if (!token) {
      this.setStatus('unauthorised');
      socket.disconnect();
      return;
    }

    const auth = socket.auth as Record<string, unknown>;
    auth.token = token;
    this.setStatus('reconnecting');
    socket.connect();
  }

  /** Closes the connection and forgets it. */
  disconnect(): void {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.setStatus('idle');
  }

  /* ── Messaging ─────────────────────────────────────────────────────────── */

  /** Subscribes to a server-pushed event; returns an unsubscribe function. */
  on<E extends keyof ServerToClientEvents>(
    event: E,
    listener: ServerToClientEvents[E],
  ): () => void {
    this.socket?.on(event, listener as never);
    return () => {
      this.socket?.off(event, listener as never);
    };
  }

  /**
   * Emits an event and awaits its acknowledgement.
   *
   * Rejects with a `RealtimeError` carrying the server's code and field
   * messages, or with a synthetic timeout error when no ack arrives — callers
   * then handle one failure shape regardless of cause.
   */
  request<T>(event: keyof ClientToServerEvents, payload?: unknown): Promise<T> {
    const socket = this.socket;
    if (!socket?.connected) {
      return Promise.reject(
        new RealtimeError({ code: 'INTERNAL_ERROR', message: 'Not connected to PaChat' }),
      );
    }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new RealtimeError({
            code: 'INTERNAL_ERROR',
            message: 'The server did not respond in time',
          }),
        );
      }, ACK_TIMEOUT_MS);

      const handle = (result: Result<T>): void => {
        clearTimeout(timer);
        if (result?.ok) resolve(result.data);
        else
          reject(
            new RealtimeError(
              result?.error ?? { code: 'INTERNAL_ERROR', message: 'Unknown failure' },
            ),
          );
      };

      // Socket.IO types `emit` as a union of per-event overloads, which cannot
      // be satisfied by a variable event name. The event *key* is still
      // constrained to `ClientToServerEvents`, so a typo is caught; only the
      // argument tuple is erased here.
      const emit = socket as unknown as LooseEmitter;

      // `directory:list` takes only an ack; everything else takes a payload
      // followed by one.
      if (payload === undefined) emit.emit(event, handle);
      else emit.emit(event, payload, handle);
    });
  }

  /** Fire-and-forget emit, for signals where an ack would be wasted traffic. */
  send(event: keyof ClientToServerEvents, payload: unknown): void {
    if (!this.socket?.connected) return;
    (this.socket as unknown as LooseEmitter).emit(event, payload);
  }
}

import {
  ROUTES,
  type ApiError,
  type AuthResponse,
  type HealthResponse,
  type LoginInput,
  type RegisterInput,
  type Self,
  type UploadResponse,
} from '@pachat/shared';
import { bridge } from './bridge';

/**
 * The REST client.
 *
 * Small surface — credentials, token lifecycle and uploads. Everything else
 * travels over the socket. All failures surface as `ApiRequestError`, which
 * carries the server's structured code and per-field messages so forms can
 * highlight the offending input instead of showing a generic banner.
 */

export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fields?: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    if (fields) this.fields = fields;
  }

  /** True when the failure is a lost connection rather than a rejection. */
  get isOffline(): boolean {
    return this.status === 0;
  }
}

const baseUrl = (): string => bridge.info.serverUrl.replace(/\/$/, '');

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  accessToken?: string | null;
  signal?: AbortSignal;
  timeoutMs?: number;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, accessToken, signal, timeoutMs = 15_000 } = options;

  // Every request gets a deadline. Without one a half-open connection leaves
  // the sign-in button spinning indefinitely with no way back.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
  if (signal) signal.addEventListener('abort', () => controller.abort(signal.reason));

  try {
    const response = await fetch(`${baseUrl()}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (response.status === 204) return undefined as T;

    const text = await response.text();
    const payload = text.length > 0 ? (JSON.parse(text) as unknown) : null;

    if (!response.ok) {
      const error = (payload as ApiError | null)?.error;
      throw new ApiRequestError(
        response.status,
        error?.code ?? 'UNKNOWN',
        error?.message ?? `Request failed with ${response.status}`,
        error?.fields,
      );
    }

    return payload as T;
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    // Status 0 is the convention for "never reached the server", which the UI
    // renders as an offline state rather than a credential problem.
    const message =
      error instanceof Error && error.message === 'timeout'
        ? 'The server took too long to respond'
        : 'Could not reach the PaChat server';
    throw new ApiRequestError(0, 'NETWORK', message);
  } finally {
    clearTimeout(timer);
  }
}

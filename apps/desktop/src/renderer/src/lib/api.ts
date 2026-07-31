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

/* ──────────────────────────────────────────────────────────────────────────── */

export const api = {
  health: (): Promise<HealthResponse> => request(ROUTES.health),

  register: (input: RegisterInput): Promise<AuthResponse> =>
    request(ROUTES.register, { method: 'POST', body: input }),

  login: (input: LoginInput): Promise<AuthResponse> =>
    request(ROUTES.login, { method: 'POST', body: input }),

  refresh: (refreshToken: string): Promise<AuthResponse> =>
    request(ROUTES.refresh, { method: 'POST', body: { refreshToken } }),

  logout: (refreshToken: string): Promise<void> =>
    request(ROUTES.logout, { method: 'POST', body: { refreshToken } }),

  me: (accessToken: string): Promise<{ self: Self }> => request(ROUTES.me, { accessToken }),

  /**
   * Uploads attachments, reporting progress.
   *
   * `XMLHttpRequest` rather than `fetch` purely because it exposes upload
   * progress events — `fetch` still cannot report how much of a request body
   * has been sent, and a 25 MiB attachment with no progress bar feels broken.
   */
  upload(
    files: File[],
    accessToken: string,
    onProgress?: (fraction: number) => void,
  ): Promise<UploadResponse> {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      for (const file of files) form.append('files', file, file.name);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${baseUrl()}${ROUTES.upload}`);
      xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
      xhr.responseType = 'json';

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.response as UploadResponse);
          return;
        }
        const error = (xhr.response as ApiError | null)?.error;
        reject(
          new ApiRequestError(
            xhr.status,
            error?.code ?? 'UPLOAD_FAILED',
            error?.message ?? 'Upload failed',
            error?.fields,
          ),
        );
      });

      xhr.addEventListener('error', () =>
        reject(new ApiRequestError(0, 'NETWORK', 'Could not reach the PaChat server')),
      );
      xhr.addEventListener('abort', () =>
        reject(new ApiRequestError(0, 'ABORTED', 'Upload cancelled')),
      );

      xhr.send(form);
    });
  },
};

/**
 * Resolves a server-relative attachment path into a loadable URL.
 *
 * The access token is appended as a query parameter because `<img src>` cannot
 * carry an Authorization header. The server restricts that fallback to GET
 * requests, so a leaked URL cannot be used to change anything.
 */
export function fileUrl(path: string, accessToken: string | null): string {
  const url = `${baseUrl()}${path}`;
  if (!accessToken) return url;
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(accessToken)}`;
}

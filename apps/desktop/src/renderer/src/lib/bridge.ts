import type {
  AppInfo,
  MenuCommand,
  NotifyRequest,
  PaChatBridge,
  ThemeMode,
  WindowState,
} from '../../../shared-ipc/contract';

/**
 * Access to the privileged Electron bridge, with a browser fallback.
 *
 * The renderer is a plain Vite app, so it can be opened in a normal browser
 * tab for fast UI iteration. Rather than scattering `window.pachat?.` guards
 * through the components, the fallback below implements the same interface
 * with web equivalents — Notification API, localStorage, no-op window
 * controls — so every call site stays unconditional.
 */

declare global {
  interface Window {
    pachat?: PaChatBridge;
  }
}

export const isDesktop = typeof window !== 'undefined' && window.pachat !== undefined;

const WEB_INFO: AppInfo = {
  version: '1.0.0-web',
  platform: 'linux',
  isPackaged: false,
  serverUrl: import.meta.env.VITE_SERVER_URL ?? 'http://127.0.0.1:4000',
};

function createWebFallback(): PaChatBridge {
  const noop = (): void => undefined;
  const noSubscription = (): (() => void) => () => undefined;

  return {
    info: WEB_INFO,

    window: {
      minimise: noop,
      toggleMaximise: noop,
      close: noop,
      onStateChange: noSubscription as (l: (s: WindowState) => void) => () => void,
    },

    secrets: {
      // Not OS-encrypted — acceptable only because this path exists purely for
      // in-browser development against a local server.
      async set(key, value) {
        localStorage.setItem(`pachat.${key}`, value);
      },
      async get(key) {
        return localStorage.getItem(`pachat.${key}`);
      },
      async delete(key) {
        localStorage.removeItem(`pachat.${key}`);
      },
    },

    notifications: {
      show(request: NotifyRequest) {
        if (!('Notification' in window)) return;
        if (Notification.permission === 'granted') {
          new Notification(request.title, { body: request.body });
        } else if (Notification.permission === 'default') {
          void Notification.requestPermission();
        }
      },
      onActivated: noSubscription as (l: (id: string) => void) => () => void,
    },

    badge: { set: noop },
    theme: { set: (_mode: ThemeMode) => undefined },
    shell: {
      openExternal(url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      },
    },
    app: {
      onFocusChanged(listener) {
        const onFocus = (): void => listener(true);
        const onBlur = (): void => listener(false);
        window.addEventListener('focus', onFocus);
        window.addEventListener('blur', onBlur);
        return () => {
          window.removeEventListener('focus', onFocus);
          window.removeEventListener('blur', onBlur);
        };
      },
      onMenuCommand: noSubscription as (l: (c: MenuCommand) => void) => () => void,
    },
  };
}

export const bridge: PaChatBridge = window.pachat ?? createWebFallback();

/** Keys used in the OS credential vault. */
export const SECRET_KEYS = {
  refreshToken: 'refresh-token',
  lastIdentifier: 'last-identifier',
} as const;

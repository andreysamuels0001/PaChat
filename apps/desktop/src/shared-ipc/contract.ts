/**
 * The IPC contract between the Electron main process and the renderer.
 *
 * The renderer runs with `contextIsolation: true` and `nodeIntegration: false`,
 * so it has no filesystem, no `require` and no direct Electron access. Every
 * privileged capability it has is one of the named channels below, exposed
 * through the preload bridge. Adding a capability therefore means adding it
 * here first — which keeps the privileged surface small and reviewable.
 */

export const IPC = {
  /* Window chrome — the frame is drawn in React, so the buttons need these. */
  windowMinimise: 'window:minimise',
  windowToggleMaximise: 'window:toggle-maximise',
  windowClose: 'window:close',
  windowState: 'window:state',

  /* Environment the renderer cannot read for itself. */
  appInfo: 'app:info',
  appFocusChanged: 'app:focus-changed',

  /* OS-encrypted credential storage for the refresh token. */
  secretSet: 'secret:set',
  secretGet: 'secret:get',
  secretDelete: 'secret:delete',

  /* Native notifications and the taskbar / dock badge. */
  notify: 'notify:show',
  notifyActivated: 'notify:activated',
  badgeSet: 'badge:set',

  /* Native theme, so the window frame matches the in-app theme. */
  themeSet: 'theme:set',

  /* Open a link in the user's browser rather than inside the app. */
  openExternal: 'shell:open-external',

  /* Global accelerators forwarded from the application menu. */
  menuCommand: 'menu:command',
} as const;

export interface WindowState {
  isMaximised: boolean;
  isFullScreen: boolean;
}

export interface AppInfo {
  version: string;
  platform: 'win32' | 'darwin' | 'linux';
  isPackaged: boolean;
  /** Base URL of the realtime gateway, resolved by the main process. */
  serverUrl: string;
}

export interface NotifyRequest {
  title: string;
  body: string;
  /** Echoed back on activation so the renderer can focus the right thread. */
  conversationId: string;
  silent?: boolean;
}

export type ThemeMode = 'dark' | 'light' | 'system';

/** Commands the native menu can trigger in the renderer. */
export type MenuCommand =
  | 'open-command-palette'
  | 'open-settings'
  | 'new-channel'
  | 'focus-composer'
  | 'next-conversation'
  | 'previous-conversation'
  | 'toggle-members'
  | 'mark-all-read';

/** The shape `window.pachat` takes in the renderer. */
export interface PaChatBridge {
  readonly info: AppInfo;

  window: {
    minimise(): void;
    toggleMaximise(): void;
    close(): void;
    onStateChange(listener: (state: WindowState) => void): () => void;
  };

  secrets: {
    set(key: string, value: string): Promise<void>;
    get(key: string): Promise<string | null>;
    delete(key: string): Promise<void>;
  };

  notifications: {
    show(request: NotifyRequest): void;
    onActivated(listener: (conversationId: string) => void): () => void;
  };

  badge: {
    set(count: number): void;
  };

  theme: {
    set(mode: ThemeMode): void;
  };

  shell: {
    openExternal(url: string): void;
  };

  app: {
    onFocusChanged(listener: (focused: boolean) => void): () => void;
    onMenuCommand(listener: (command: MenuCommand) => void): () => void;
  };
}

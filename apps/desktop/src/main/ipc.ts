import { app, ipcMain, nativeTheme, Notification, type BrowserWindow } from 'electron';
import { IPC, type AppInfo, type NotifyRequest, type ThemeMode } from '../shared-ipc/contract.js';
import { deleteSecret, getSecret, setSecret } from './secure-store.js';
import { applyNativeTheme, openExternally } from './window.js';

/** Where the renderer should reach the gateway. */
function serverUrl(): string {
  return process.env.PACHAT_SERVER_URL ?? 'http://127.0.0.1:4000';
}

/**
 * Registers every privileged operation the renderer can request.
 *
 * `handle` for anything that returns a value, `on` for fire-and-forget. Each
 * handler re-validates its input: the renderer is the least-trusted part of
 * the app, and a compromised one must not be able to reach outside this set.
 */
export function registerIpcHandlers(window: BrowserWindow): void {
  /* ── Window chrome ─────────────────────────────────────────────────────── */

  ipcMain.on(IPC.windowMinimise, () => {
    if (!window.isDestroyed()) window.minimize();
  });

  ipcMain.on(IPC.windowToggleMaximise, () => {
    if (window.isDestroyed()) return;
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  });

  ipcMain.on(IPC.windowClose, () => {
    if (!window.isDestroyed()) window.close();
  });

  /* ── Environment ───────────────────────────────────────────────────────── */

  const info: AppInfo = {
    version: app.getVersion(),
    platform: process.platform as AppInfo['platform'],
    isPackaged: app.isPackaged,
    serverUrl: serverUrl(),
  };

  ipcMain.handle(IPC.appInfo, () => info);
  // The preload reads this synchronously, before the page exists, so that the
  // renderer sees `window.pachat.info` as a value rather than a promise.
  ipcMain.on(IPC.appInfo, (event) => {
    event.returnValue = info;
  });

  /* ── Secrets ───────────────────────────────────────────────────────────── */

  // Namespaced so a bug in the renderer cannot read or clobber an unrelated
  // key, and length-capped so it cannot be used as general-purpose storage.
  const scopedKey = (key: unknown): string => {
    if (typeof key !== 'string' || key.length === 0 || key.length > 64) {
      throw new Error('invalid secret key');
    }
    return `pachat.${key.replace(/[^a-zA-Z0-9._-]/g, '')}`;
  };

  ipcMain.handle(IPC.secretSet, (_event, key: unknown, value: unknown) => {
    if (typeof value !== 'string' || value.length > 8192) throw new Error('invalid secret value');
    setSecret(scopedKey(key), value);
  });

  ipcMain.handle(IPC.secretGet, (_event, key: unknown) => getSecret(scopedKey(key)));

  ipcMain.handle(IPC.secretDelete, (_event, key: unknown) => {
    deleteSecret(scopedKey(key));
  });

  /* ── Notifications ─────────────────────────────────────────────────────── */

  ipcMain.on(IPC.notify, (_event, request: NotifyRequest) => {
    if (!Notification.isSupported()) return;
    if (typeof request?.title !== 'string' || typeof request?.body !== 'string') return;

    const notification = new Notification({
      title: request.title.slice(0, 120),
      body: request.body.slice(0, 400),
      silent: request.silent ?? false,
    });

    notification.on('click', () => {
      if (window.isDestroyed()) return;
      // Restore before focus: a minimised window cannot take focus, so
      // clicking the toast would otherwise appear to do nothing.
      if (window.isMinimized()) window.restore();
      window.focus();
      window.webContents.send(IPC.notifyActivated, request.conversationId);
    });

    notification.show();
  });

  ipcMain.on(IPC.badgeSet, (_event, count: unknown) => {
    const value = typeof count === 'number' && Number.isFinite(count) ? Math.max(0, count) : 0;

    if (process.platform === 'darwin') {
      app.dock?.setBadge(value > 0 ? String(value) : '');
      return;
    }
    // Windows and most Linux desktops only support a boolean overlay through
    // Electron's cross-platform API.
    app.setBadgeCount(value);
  });

  /* ── Theme ─────────────────────────────────────────────────────────────── */

  ipcMain.on(IPC.themeSet, (_event, mode: unknown) => {
    const theme: ThemeMode =
      mode === 'dark' || mode === 'light' || mode === 'system' ? mode : 'system';
    nativeTheme.themeSource = theme;
    applyNativeTheme(window, nativeTheme.shouldUseDarkColors);
  });

  /* ── Shell ─────────────────────────────────────────────────────────────── */

  ipcMain.on(IPC.openExternal, (_event, url: unknown) => {
    if (typeof url === 'string') void openExternally(url);
  });
}

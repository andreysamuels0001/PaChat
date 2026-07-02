import { join } from 'node:path';
import { app, BrowserWindow, nativeTheme, session } from 'electron';
import { disposeIpcHandlers, registerIpcHandlers } from './ipc.js';
import { installApplicationMenu } from './menu.js';
import { createMainWindow } from './window.js';

/**
 * Electron main process.
 *
 * Responsibilities, in order: enforce a single instance, lock down the
 * renderer's privileges, create the window, wire the IPC bridge, and manage
 * the platform-specific lifecycle differences between macOS and the rest.
 */

const DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL;

let mainWindow: BrowserWindow | null = null;

/**
 * A chat client must be a single instance: a second launch should raise the
 * existing window, not open a duplicate that fights over the same socket and
 * notification state.
 */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  void bootstrap();
}

async function bootstrap(): Promise<void> {
  // Windows reads this to group taskbar entries and attribute notifications.
  if (process.platform === 'win32') app.setAppUserModelId('app.pachat.desktop');

  await app.whenReady();

  hardenSession();

  nativeTheme.themeSource = 'dark';

  mainWindow = createMainWindow();
  registerIpcHandlers(mainWindow);
  installApplicationMenu(mainWindow);

  await loadRenderer(mainWindow);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // macOS keeps the app alive with no windows; re-activating must recreate one.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length > 0) return;
    mainWindow = createMainWindow();
    registerIpcHandlers(mainWindow);
    installApplicationMenu(mainWindow);
    void loadRenderer(mainWindow);
  });
}

async function loadRenderer(window: BrowserWindow): Promise<void> {
  if (DEV_SERVER_URL) {
    await window.loadURL(DEV_SERVER_URL);
    window.webContents.openDevTools({ mode: 'detach' });
    return;
  }
  await window.loadFile(join(__dirname, '../renderer/index.html'));
}

/**
 * Session-level hardening applied before any page loads.
 *
 * A Content-Security-Policy is injected rather than written as a meta tag so
 * that it also covers the Vite dev server, where the HTML is served by Vite
 * and an inline meta policy would have to be loosened for HMR.
 */
function hardenSession(): void {
  const gateway = process.env.PACHAT_SERVER_URL ?? 'http://127.0.0.1:4000';
  const websocket = gateway.replace(/^http/, 'ws');

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const scriptSources = DEV_SERVER_URL
      ? // Vite's HMR client needs eval in development only.
        `'self' 'unsafe-inline' 'unsafe-eval' ${DEV_SERVER_URL}`
      : `'self'`;

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          [
            `default-src 'self'`,
            `script-src ${scriptSources}`,
            // Tailwind injects styles at runtime, which requires inline styles.
            `style-src 'self' 'unsafe-inline'`,
            `font-src 'self' data:`,
            // Attachments and avatars are served by the gateway.
            `img-src 'self' data: blob: ${gateway}`,
            `media-src 'self' blob: ${gateway}`,
            `connect-src 'self' ${gateway} ${websocket}${DEV_SERVER_URL ? ` ${DEV_SERVER_URL} ws://localhost:5173` : ''}`,
            // No plugins, no nested browsing contexts, no form posts anywhere.
            `object-src 'none'`,
            `frame-src 'none'`,
            `form-action 'none'`,
            `base-uri 'none'`,
          ].join('; '),
        ],
      },
    });
  });

  // Chat needs none of these, and silently denying is better than a prompt the
  // user cannot evaluate.
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    const allowed = new Set(['clipboard-sanitized-write', 'notifications']);
    callback(allowed.has(permission));
  });

  // Block renderer-initiated navigation to anything outside the bundle.
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });
}

app.on('window-all-closed', () => {
  // On macOS, closing the last window should not quit the app.
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  disposeIpcHandlers();
});

import { join } from 'node:path';
import { BrowserWindow, nativeTheme, shell } from 'electron';
import { IPC, type WindowState } from '../shared-ipc/contract.js';
import { restoredBounds, trackWindow } from './window-state.js';

/** Chrome colours for the Windows titlebar overlay, per theme. */
const OVERLAY = {
  dark: { color: '#0b0c10', symbolColor: '#9ca3b4', height: 44 },
  light: { color: '#f7f8fa', symbolColor: '#4b5563', height: 44 },
} as const;

export function createMainWindow(): BrowserWindow {
  const { bounds, isMaximised } = restoredBounds();
  const isDark = nativeTheme.shouldUseDarkColors;

  const window = new BrowserWindow({
    ...bounds,
    minWidth: 920,
    minHeight: 600,
    // Paint only once React has mounted, so launch never flashes a white box.
    show: false,
    backgroundColor: isDark ? '#0b0c10' : '#f7f8fa',
    title: 'PaChat',
    // The titlebar is drawn in React. On Windows and Linux the native frame is
    // removed entirely; on macOS it is kept hidden so the traffic lights stay
    // native, which is what users there expect.
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: process.platform === 'win32' ? (isDark ? OVERLAY.dark : OVERLAY.light) : false,
    trafficLightPosition: { x: 16, y: 15 },
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // The three settings that matter. The renderer is treated as untrusted:
      // no Node, an isolated context, and a sandboxed process.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
    },
  });

  if (isMaximised) window.maximize();

  window.once('ready-to-show', () => window.show());

  // Any attempt to navigate the shell itself — a clicked link, a crafted
  // anchor — leaves the app and opens in the user's browser. The renderer
  // never navigates away from the application bundle.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void openExternally(url);
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    const current = window.webContents.getURL();
    if (url !== current) {
      event.preventDefault();
      void openExternally(url);
    }
  });

  // Keep the renderer's own chrome in sync with the real window state.
  const publishState = (): void => {
    if (window.isDestroyed()) return;
    const state: WindowState = {
      isMaximised: window.isMaximized(),
      isFullScreen: window.isFullScreen(),
    };
    window.webContents.send(IPC.windowState, state);
  };

  window.on('maximize', publishState);
  window.on('unmaximize', publishState);
  window.on('enter-full-screen', publishState);
  window.on('leave-full-screen', publishState);
  window.webContents.on('did-finish-load', publishState);

  window.on('focus', () => window.webContents.send(IPC.appFocusChanged, true));
  window.on('blur', () => window.webContents.send(IPC.appFocusChanged, false));

  trackWindow(window);

  return window;
}

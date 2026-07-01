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

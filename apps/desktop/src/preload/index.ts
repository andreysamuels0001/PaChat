import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC,
  type AppInfo,
  type MenuCommand,
  type NotifyRequest,
  type PaChatBridge,
  type ThemeMode,
  type WindowState,
} from '../shared-ipc/contract.js';

/**
 * The preload bridge.
 *
 * This is the only code with access to both Electron and the page. It exposes
 * a small, hand-written API — never `ipcRenderer` itself, which would let the
 * renderer address any channel in the main process and defeat the point of
 * context isolation.
 *
 * Every subscription returns an unsubscribe function so React effects can
 * clean up; without that, a remounting component silently accumulates
 * listeners until Electron's max-listeners warning fires.
 */

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T): void => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

// Read synchronously during preload so `window.pachat.info` is a plain value in
// the renderer rather than a promise every call site has to await. This is the
// one place a synchronous IPC round-trip is worth it: it happens once, before
// the page has any content to block.
const info = ipcRenderer.sendSync(IPC.appInfo) as AppInfo;

const bridge: PaChatBridge = {
  info,

  window: {
    minimise: () => ipcRenderer.send(IPC.windowMinimise),
    toggleMaximise: () => ipcRenderer.send(IPC.windowToggleMaximise),
    close: () => ipcRenderer.send(IPC.windowClose),
    onStateChange: (listener) => subscribe<WindowState>(IPC.windowState, listener),
  },

  secrets: {
    set: (key, value) => ipcRenderer.invoke(IPC.secretSet, key, value) as Promise<void>,
    get: (key) => ipcRenderer.invoke(IPC.secretGet, key) as Promise<string | null>,
    delete: (key) => ipcRenderer.invoke(IPC.secretDelete, key) as Promise<void>,
  },

  notifications: {
    show: (request: NotifyRequest) => ipcRenderer.send(IPC.notify, request),
    onActivated: (listener) => subscribe<string>(IPC.notifyActivated, listener),
  },

  badge: {
    set: (count) => ipcRenderer.send(IPC.badgeSet, count),
  },

  theme: {
    set: (mode: ThemeMode) => ipcRenderer.send(IPC.themeSet, mode),
  },

  shell: {
    openExternal: (url) => ipcRenderer.send(IPC.openExternal, url),
  },

  app: {
    onFocusChanged: (listener) => subscribe<boolean>(IPC.appFocusChanged, listener),
    onMenuCommand: (listener) => subscribe<MenuCommand>(IPC.menuCommand, listener),
  },
};

contextBridge.exposeInMainWorld('pachat', bridge);

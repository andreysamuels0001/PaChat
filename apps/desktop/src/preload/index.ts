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

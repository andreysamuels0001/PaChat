import { create } from 'zustand';
import { createId, type Message, type Preferences } from '@pachat/shared';
import { bridge } from '../lib/bridge';

/**
 * Presentation state — everything that is about the window rather than the
 * data in it. Kept separate from the chat cache so a panel toggle never
 * invalidates a message list render.
 */

export interface Toast {
  id: string;
  tone: 'info' | 'success' | 'warning' | 'danger';
  title: string;
  description?: string;
}

export type Overlay = 'none' | 'palette' | 'settings' | 'new-channel' | 'new-direct';

interface UiState {
  theme: Preferences['theme'];
  compact: boolean;
  reduceMotion: boolean;
  showMembers: boolean;
  overlay: Overlay;
  windowMaximised: boolean;
  windowFocused: boolean;
  toasts: Toast[];
  /** The message being replied to, scoped to the active conversation. */
  replyTo: Message | null;
  /** The id of the message currently open in the inline editor. */
  editing: string | null;

  setTheme: (theme: Preferences['theme']) => void;
  setCompact: (compact: boolean) => void;
  setReduceMotion: (reduce: boolean) => void;
  toggleMembers: () => void;
  openOverlay: (overlay: Overlay) => void;
  closeOverlay: () => void;
  setWindowMaximised: (maximised: boolean) => void;
  setWindowFocused: (focused: boolean) => void;
  toast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
  setReplyTo: (message: Message | null) => void;
  setEditing: (messageId: string | null) => void;
  /** Mirrors server-side preferences into the presentation layer. */
  applyPreferences: (preferences: Preferences) => void;
}

/**
 * Applies the theme to the document and the native window frame together, so
 * the titlebar never disagrees with the content it sits above.
 */
function paintTheme(theme: Preferences['theme']): void {
  const resolved =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark'
      : theme;

  document.documentElement.dataset.theme = resolved;
  bridge.theme.set(theme);
}

function paintMotion(reduce: boolean): void {
  if (reduce) document.documentElement.dataset.motion = 'reduced';
  else delete document.documentElement.dataset.motion;
}

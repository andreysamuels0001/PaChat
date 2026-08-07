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

const TOAST_TTL_MS = 5_000;

export const useUi = create<UiState>()((set, get) => ({
  theme: 'dark',
  compact: false,
  reduceMotion: false,
  showMembers: true,
  overlay: 'none',
  windowMaximised: false,
  windowFocused: true,
  toasts: [],
  replyTo: null,
  editing: null,

  setTheme(theme) {
    paintTheme(theme);
    set({ theme });
  },

  setCompact(compact) {
    set({ compact });
  },

  setReduceMotion(reduceMotion) {
    paintMotion(reduceMotion);
    set({ reduceMotion });
  },

  toggleMembers() {
    set((state) => ({ showMembers: !state.showMembers }));
  },

  openOverlay(overlay) {
    set({ overlay });
  },

  closeOverlay() {
    set({ overlay: 'none' });
  },

  setWindowMaximised(windowMaximised) {
    set({ windowMaximised });
  },

  setWindowFocused(windowFocused) {
    set({ windowFocused });
  },

  toast(toast) {
    const id = createId();
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
    // Auto-dismiss. Toasts are informational; anything requiring a decision
    // belongs in a dialog instead.
    window.setTimeout(() => get().dismissToast(id), TOAST_TTL_MS);
  },

  dismissToast(id) {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },

  setReplyTo(replyTo) {
    set({ replyTo, editing: null });
  },

  setEditing(editing) {
    set({ editing, replyTo: null });
  },

  applyPreferences(preferences) {
    paintTheme(preferences.theme);
    paintMotion(preferences.reduceMotion);
    set({
      theme: preferences.theme,
      compact: preferences.compactDensity,
      reduceMotion: preferences.reduceMotion,
    });
  },
}));

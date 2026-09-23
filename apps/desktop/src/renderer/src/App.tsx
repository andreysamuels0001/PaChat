import { useEffect } from 'react';
import { Logo } from '@/components/brand/Logo';
import { TitleBar } from '@/components/chrome/TitleBar';
import { ConnectionBanner } from '@/components/chrome/ConnectionBanner';
import { Toaster } from '@/components/ui/Feedback';
import { bridge } from '@/lib/bridge';
import { AuthScreen } from '@/features/auth/AuthScreen';
import { ChatShell } from '@/features/chat/ChatShell';
import { useSession } from '@/store/session-store';
import { useUi } from '@/store/ui-store';
import { startRealtime, stopRealtime } from '@/store/realtime';

/**
 * The application root.
 *
 * Owns exactly three things: the launch sequence, the authenticated /
 * unauthenticated switch, and the window-level subscriptions. Everything else
 * lives below `ChatShell`.
 */
export function App() {
  const status = useSession((s) => s.status);
  const restore = useSession((s) => s.restore);
  const setWindowMaximised = useUi((s) => s.setWindowMaximised);
  const setWindowFocused = useUi((s) => s.setWindowFocused);

  /* Silent sign-in from the stored refresh token, once, on launch. */
  useEffect(() => {
    void restore();
  }, [restore]);

  /* Window chrome and focus state come from the main process. */
  useEffect(() => {
    const offState = bridge.window.onStateChange((state) => setWindowMaximised(state.isMaximised));
    const offFocus = bridge.app.onFocusChanged(setWindowFocused);
    return () => {
      offState();
      offFocus();
    };
  }, [setWindowMaximised, setWindowFocused]);

  /**
   * The socket's lifetime is tied to authentication, not to the component
   * tree: it opens once a session exists and closes on sign-out, so a
   * re-render can never tear down a live connection.
   */
  useEffect(() => {
    if (status === 'authenticated') startRealtime();
    else stopRealtime();
  }, [status]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-base text-ink">
      <TitleBar />
      <ConnectionBanner />

      {status === 'booting' ? (
        <SplashScreen />
      ) : status === 'authenticated' ? (
        <ChatShell />
      ) : (
        <AuthScreen />
      )}

      <Toaster />
    </div>
  );
}

/**
 * Shown only while the stored credentials are exchanged for a session — a few
 * hundred milliseconds. Deliberately minimal: a spinner-heavy splash makes a
 * fast launch feel slower than it is.
 */
function SplashScreen() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <Logo size={40} className="opacity-90" />
      <div className="h-0.5 w-28 overflow-hidden rounded-full bg-hover">
        <div className="skeleton h-full w-full" />
      </div>
    </div>
  );
}

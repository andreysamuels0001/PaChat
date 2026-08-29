import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  AtSign,
  Eye,
  EyeOff,
  Lock,
  Sparkles,
  User as UserIcon,
  Zap,
} from 'lucide-react';
import { accentFor, LIMITS } from '@pachat/shared';
import { cn } from '@/lib/cn';
import { Wordmark } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { useSession } from '@/store/session-store';

/**
 * Sign-in and account creation.
 *
 * A single screen with two modes rather than two routes: the fields overlap
 * almost entirely, and switching modes should not feel like navigating away
 * from what you had already typed.
 */

type Mode = 'signin' | 'signup';

export function AuthScreen() {
  const status = useSession((s) => s.status);
  const error = useSession((s) => s.error);
  const remembered = useSession((s) => s.rememberedIdentifier);
  const signIn = useSession((s) => s.signIn);
  const signUp = useSession((s) => s.signUp);
  const clearError = useSession((s) => s.clearError);

  const [mode, setMode] = useState<Mode>('signin');
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [revealed, setRevealed] = useState(false);

  const busy = status === 'authenticating';

  useEffect(() => {
    if (remembered && identifier.length === 0) setIdentifier(remembered);
  }, [remembered, identifier.length]);

  const fieldErrors = error?.fields ?? {};

  /** Derives a sensible username from a typed display name, once. */
  const suggestedUsername = useMemo(
    () =>
      displayName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '.')
        .replace(/^\.+|\.+$/g, '')
        .slice(0, LIMITS.usernameMax),
    [displayName],
  );

  const switchMode = (next: Mode): void => {
    clearError();
    setMode(next);
  };

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (busy) return;

    if (mode === 'signin') {
      await signIn({ identifier: identifier.trim(), password });
      return;
    }

    await signUp({
      email: email.trim(),
      username: (username || suggestedUsername).trim(),
      displayName: displayName.trim(),
      password,
      accentColor: accentFor(username || suggestedUsername || email),
    });
  };

  const canSubmit =
    mode === 'signin'
      ? identifier.trim().length >= 3 && password.length >= LIMITS.passwordMin
      : email.trim().length > 3 &&
        displayName.trim().length > 0 &&
        (username || suggestedUsername).length >= LIMITS.usernameMin &&
        password.length >= LIMITS.passwordMin;

  return (
    <div className="relative flex h-full overflow-hidden bg-base">
      <Aurora />

      {/* ── Left: the pitch ──────────────────────────────────────────────── */}
      <aside className="relative hidden flex-1 flex-col justify-between p-12 lg:flex">
        <Wordmark size="lg" />

        <div className="max-w-md">
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="text-[40px] leading-[1.08] font-semibold tracking-[-0.03em] text-ink"
          >
            Conversations that
            <br />
            arrive the instant
            <br />
            they are sent.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="mt-5 text-[15px] leading-relaxed text-ink-muted"
          >
            A self-hosted desktop messenger with presence, typing indicators, read receipts,
            threaded replies and full-text search — built on a single typed realtime protocol.
          </motion.p>

          <motion.ul
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.16 }}
            className="mt-8 flex flex-col gap-3"
          >
            <Highlight icon={<Zap />} text="Optimistic sends with idempotent retries" />
            <Highlight icon={<Sparkles />} text="Your data stays on your own server" />
          </motion.ul>
        </div>

        <p className="text-[12px] text-ink-faint">
          Crafted by Andrey Samuels · MIT licensed · Open source
        </p>
      </aside>

      {/* ── Right: the form ──────────────────────────────────────────────── */}
      <main className="relative flex w-full items-center justify-center p-6 lg:w-[480px] lg:shrink-0">
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            'w-full max-w-sm rounded-xl border border-line bg-raised/85 p-7',
            'shadow-elevation-lg backdrop-blur-xl',
          )}
        >
          <div className="lg:hidden">
            <Wordmark className="mb-6" />
          </div>

          <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-ink">
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="mt-1 text-[13px] text-ink-dim">
            {mode === 'signin'
              ? 'Sign in to pick up where you left off.'
              : 'A few details and you are in.'}
          </p>

          <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
            {mode === 'signin' ? (
              <TextField
                label="Email or username"
                autoFocus
                autoComplete="username"
                spellCheck={false}
                value={identifier}
                icon={<AtSign />}
                error={fieldErrors.identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="ada@pachat.app"
              />
            ) : (
              <>
                <TextField
                  label="Display name"
                  autoFocus
                  autoComplete="name"
                  value={displayName}
                  icon={<UserIcon />}
                  error={fieldErrors.displayName}
                  maxLength={LIMITS.displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Ada Lovelace"
                />
                <TextField
                  label="Username"
                  autoComplete="username"
                  spellCheck={false}
                  value={username}
                  icon={<AtSign />}
                  error={fieldErrors.username}
                  maxLength={LIMITS.usernameMax}
                  // Shows the derived handle as a placeholder so the field can
                  // be skipped entirely without feeling like a guess.
                  placeholder={suggestedUsername || 'ada'}
                  hint="Lowercase letters, digits, dots and dashes."
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                />
                <TextField
                  label="Email"
                  type="email"
                  autoComplete="email"
                  spellCheck={false}
                  value={email}
                  icon={<AtSign />}
                  error={fieldErrors.email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ada@pachat.app"
                />
              </>
            )}

            <TextField
              label="Password"
              type={revealed ? 'text' : 'password'}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              icon={<Lock />}
              error={fieldErrors.password}
              hint={mode === 'signup' ? `At least ${LIMITS.passwordMin} characters.` : undefined}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              trailing={
                <button
                  type="button"
                  aria-label={revealed ? 'Hide password' : 'Show password'}
                  onClick={() => setRevealed((v) => !v)}
                  className="rounded-xs p-1 text-ink-faint hover:text-ink-muted"
                >
                  {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              }
            />

            {/* Non-field failures — wrong credentials, server unreachable. */}
            {error && !error.fields && (
              <p
                role="alert"
                className="rounded-md border border-danger/25 bg-danger/10 px-3 py-2 text-[12.5px] text-danger"
              >
                {error.message}
              </p>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              loading={busy}
              disabled={!canSubmit}
              iconRight={<ArrowRight />}
              className="mt-1"
            >
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </Button>
          </form>

          <p className="mt-5 text-center text-[12.5px] text-ink-dim">
            {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button
              type="button"
              onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
              className="font-medium text-accent-300 hover:underline"
            >
              {mode === 'signin' ? 'Create one' : 'Sign in'}
            </button>
          </p>

          {mode === 'signin' && <DemoHint onUse={(id) => setIdentifier(id)} />}
        </motion.div>
      </main>
    </div>
  );
}

function Highlight({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex items-center gap-3 text-[13.5px] text-ink-muted">
      <span
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-md',
          'border border-accent-500/20 bg-accent-500/10 text-accent-300 [&>svg]:size-3.5',
        )}
      >
        {icon}
      </span>
      {text}
    </li>
  );
}

/**
 * Seeded-workspace credentials.
 *
 * Shown only in development. A showcase app that greets a first-time visitor
 * with an empty login form wastes the demo; one click into a populated
 * workspace is the point.
 */
function DemoHint({ onUse }: { onUse: (identifier: string) => void }) {
  if (import.meta.env.PROD) return null;

  return (
    <div className="mt-5 rounded-md border border-line-subtle bg-sunken/60 px-3 py-2.5">
      <p className="text-[11.5px] font-medium tracking-wide text-ink-faint uppercase">
        Demo workspace
      </p>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <code className="font-mono text-[11.5px] text-ink-muted">ada@pachat.app · pachat123</code>
        <button
          type="button"
          onClick={() => onUse('ada@pachat.app')}
          className="shrink-0 text-[11.5px] font-medium text-accent-300 hover:underline"
        >
          Use
        </button>
      </div>
    </div>
  );
}

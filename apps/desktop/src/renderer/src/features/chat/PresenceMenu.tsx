import { useState } from 'react';
import { Check, LogOut, Pencil } from 'lucide-react';
import { LIMITS, type PresenceState } from '@pachat/shared';
import { cn } from '@/lib/cn';
import { Popover } from '@/components/ui/Overlay';
import { PRESENCE_BG, presenceLabel } from '@/components/ui/Avatar';
import { useSession } from '@/store/session-store';
import { setPresence } from '@/store/realtime';

/**
 * Presence picker and sign-out, anchored to the self card.
 *
 * "Offline" is absent on purpose: presence is derived from live connections,
 * so claiming to be offline while holding an open socket would make the state
 * a lie that every other member can observe. Busy is the honest equivalent.
 */

const OPTIONS: Array<{ state: Exclude<PresenceState, 'offline'>; hint: string }> = [
  { state: 'online', hint: 'Available and reading' },
  { state: 'away', hint: 'Stepped away from the keyboard' },
  { state: 'busy', hint: 'Notifications stay quiet' },
];

export function PresenceMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const self = useSession((s) => s.self);
  const signOut = useSession((s) => s.signOut);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  if (!self) return null;

  const choose = (state: Exclude<PresenceState, 'offline'>): void => {
    void setPresence(state, self.presence.message);
    onClose();
  };

  const commitStatus = (): void => {
    void setPresence(
      self.presence.state === 'offline' ? 'online' : self.presence.state,
      draft.trim() || null,
    );
    setEditing(false);
    onClose();
  };

  return (
    <Popover open={open} onClose={onClose} align="start" side="top">
      <div className="w-64 p-1.5">
        <p className="px-2 pt-1 pb-2 text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
          Set yourself as
        </p>

        {OPTIONS.map(({ state, hint }) => (
          <button
            key={state}
            type="button"
            onClick={() => choose(state)}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left',
              'transition-colors hover:bg-hover',
            )}
          >
            <span className={cn('size-2.5 shrink-0 rounded-full', PRESENCE_BG[state])} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] text-ink">{presenceLabel[state]}</span>
              <span className="block truncate text-[11.5px] text-ink-faint">{hint}</span>
            </span>
            {self.presence.state === state && (
              <Check className="size-3.5 shrink-0 text-accent-300" />
            )}
          </button>
        ))}

        <div className="my-1.5 h-px bg-[var(--c-border-subtle)]" />

        {editing ? (
          <div className="px-1 pb-1">
            <input
              autoFocus
              value={draft}
              maxLength={LIMITS.statusMessage}
              placeholder="What are you working on?"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitStatus();
                if (event.key === 'Escape') setEditing(false);
              }}
              onBlur={commitStatus}
              className={cn(
                'h-8 w-full rounded-sm border border-line bg-sunken px-2 text-[12.5px]',
                'text-ink outline-none selectable placeholder:text-ink-faint',
                'focus:border-accent-500/60',
              )}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(self.presence.message ?? '');
              setEditing(true);
            }}
            className="flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left hover:bg-hover"
          >
            <Pencil className="size-3.5 shrink-0 text-ink-dim" />
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink-muted">
              {self.presence.message ?? 'Set a status message'}
            </span>
          </button>
        )}

        <div className="my-1.5 h-px bg-[var(--c-border-subtle)]" />

        <button
          type="button"
          onClick={() => void signOut()}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left',
            'text-danger transition-colors hover:bg-danger/12',
          )}
        >
          <LogOut className="size-3.5 shrink-0" />
          <span className="text-[13px]">Sign out</span>
        </button>
      </div>
    </Popover>
  );
}

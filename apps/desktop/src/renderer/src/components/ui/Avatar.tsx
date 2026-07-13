import { useMemo, useState } from 'react';
import { initialsOf, type AccentColor, type PresenceState, type User } from '@pachat/shared';
import { cn } from '@/lib/cn';
import { fileUrl } from '@/lib/api';
import { useSession } from '@/store/session-store';

/**
 * Member avatar.
 *
 * Falls back to initials on the member's own accent colour when there is no
 * image, which means a workspace with no uploaded photos still reads as a set
 * of distinct people rather than a column of identical grey circles.
 */

const SIZES = {
  xs: { box: 'size-5', text: 'text-[9px]', dot: 'size-1.5 ring-[1.5px]' },
  sm: { box: 'size-6', text: 'text-[10px]', dot: 'size-2 ring-2' },
  md: { box: 'size-8', text: 'text-[11.5px]', dot: 'size-2.5 ring-2' },
  lg: { box: 'size-10', text: 'text-[13px]', dot: 'size-3 ring-2' },
  xl: { box: 'size-20', text: 'text-[26px]', dot: 'size-4 ring-[3px]' },
} as const;

export type AvatarSize = keyof typeof SIZES;

const ACCENT_BG: Record<AccentColor, string> = {
  indigo: 'bg-[var(--c-user-indigo)]',
  violet: 'bg-[var(--c-user-violet)]',
  cyan: 'bg-[var(--c-user-cyan)]',
  emerald: 'bg-[var(--c-user-emerald)]',
  amber: 'bg-[var(--c-user-amber)]',
  rose: 'bg-[var(--c-user-rose)]',
  sky: 'bg-[var(--c-user-sky)]',
  fuchsia: 'bg-[var(--c-user-fuchsia)]',
};

const PRESENCE_BG: Record<PresenceState, string> = {
  online: 'bg-[var(--c-presence-online)]',
  away: 'bg-[var(--c-presence-away)]',
  busy: 'bg-[var(--c-presence-busy)]',
  offline: 'bg-[var(--c-presence-offline)]',
};

export interface AvatarProps {
  user: Pick<User, 'displayName' | 'avatarUrl' | 'accentColor'> & {
    presence?: { state: PresenceState };
  };
  size?: AvatarSize;
  /** Renders the presence dot in the bottom-right corner. */
  showPresence?: boolean;
  className?: string;
}

export function Avatar({ user, size = 'md', showPresence = false, className }: AvatarProps) {
  const token = useSession((s) => s.accessToken);
  const [failed, setFailed] = useState(false);
  const metrics = SIZES[size];

  const src = useMemo(
    () => (user.avatarUrl && !failed ? fileUrl(user.avatarUrl, token) : null),
    [user.avatarUrl, failed, token],
  );

  return (
    <div className={cn('relative shrink-0', metrics.box, className)}>
      {src ? (
        <img
          src={src}
          alt={user.displayName}
          draggable={false}
          // A broken avatar URL must degrade to initials, not to a torn-image
          // glyph in the middle of the message list.
          onError={() => setFailed(true)}
          className="size-full rounded-full object-cover ring-1 ring-black/20"
        />
      ) : (
        <div
          aria-label={user.displayName}
          className={cn(
            'flex size-full items-center justify-center rounded-full',
            'font-semibold tracking-tight text-black/80 select-none',
            metrics.text,
            ACCENT_BG[user.accentColor],
          )}
        >
          {initialsOf(user.displayName)}
        </div>
      )}

      {showPresence && user.presence && (
        <span
          aria-hidden
          className={cn(
            'absolute -right-px -bottom-px rounded-full ring-base',
            metrics.dot,
            PRESENCE_BG[user.presence.state],
          )}
        >
          {/* A single expanding ring marks "online" without an endless
              animation competing for attention in a busy member list. */}
          {user.presence.state === 'online' && (
            <span className="absolute inset-0 rounded-full bg-[var(--c-presence-online)] [animation:pachat-ring_2.4s_var(--ease)_infinite]" />
          )}
        </span>
      )}
    </div>
  );
}

/** Overlapping avatars, used for direct-message rows and member summaries. */
export function AvatarStack({
  users,
  size = 'sm',
  max = 3,
}: {
  users: AvatarProps['user'][];
  size?: AvatarSize;
  max?: number;
}) {
  const shown = users.slice(0, max);
  const overflow = users.length - shown.length;

  return (
    <div className="flex items-center">
      {shown.map((user, index) => (
        <div
          key={`${user.displayName}-${index}`}
          className={cn(index > 0 && '-ml-2', 'rounded-full ring-2 ring-base')}
        >
          <Avatar user={user} size={size} />
        </div>
      ))}
      {overflow > 0 && (
        <div
          className={cn(
            '-ml-2 flex items-center justify-center rounded-full bg-hover',
            'text-[10px] font-semibold text-ink-dim ring-2 ring-base',
            SIZES[size].box,
          )}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}

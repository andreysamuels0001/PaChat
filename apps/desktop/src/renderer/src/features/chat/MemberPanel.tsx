import { useMemo } from 'react';
import { Check, Crown, MessageSquare, Shield } from 'lucide-react';
import {
  formatRelativeTime,
  type Conversation,
  type PresenceState,
  type User,
} from '@pachat/shared';
import { Avatar, presenceLabel } from '@/components/ui/Avatar';
import { IconButton } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Controls';
import { useChat } from '@/store/chat-store';
import { useSession } from '@/store/session-store';
import { openDirectMessage } from '@/store/realtime';

/**
 * The member list.
 *
 * Grouped by presence rather than sorted alphabetically: in a chat app the
 * question is almost always "who can answer me right now", and an alphabetical
 * list buries that under names.
 *
 * Read receipts are shown here rather than per message — a tick on every
 * bubble is noise, while "who has caught up" is genuinely useful.
 */

const ORDER: PresenceState[] = ['online', 'busy', 'away', 'offline'];

export function MemberPanel({ conversation }: { conversation: Conversation }) {
  const users = useChat((s) => s.users);
  const self = useSession((s) => s.self);

  const groups = useMemo(() => {
    const byState = new Map<
      PresenceState,
      Array<{ user: User; role: string; lastReadAt: number }>
    >();

    for (const member of conversation.members) {
      const user = users.get(member.userId);
      if (!user) continue;
      const list = byState.get(user.presence.state) ?? [];
      list.push({ user, role: member.role, lastReadAt: member.lastReadAt });
      byState.set(user.presence.state, list);
    }

    for (const list of byState.values()) {
      list.sort((a, b) => a.user.displayName.localeCompare(b.user.displayName));
    }

    return ORDER.map((state) => ({ state, members: byState.get(state) ?? [] })).filter(
      (group) => group.members.length > 0,
    );
  }, [conversation.members, users]);

  const newestMessageAt = conversation.lastMessage?.createdAt ?? 0;
  const showReceipts = self?.preferences.showReadReceipts ?? true;

  return (
    <aside
      className="flex w-(--members-width) shrink-0 flex-col bg-sunken/40 hairline-l"
      aria-label="Members"
    >
      <header className="flex h-14 shrink-0 items-center px-4 hairline-b">
        <h2 className="text-[12px] font-semibold tracking-[0.06em] text-ink-faint uppercase">
          Members · {conversation.members.length}
        </h2>
      </header>

      <div className="scroll-area flex-1 overflow-y-auto px-2 py-3">
        {groups.map((group) => (
          <section key={group.state} className="mb-4">
            <h3 className="flex items-center gap-1.5 px-2 pb-1.5 text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
              {presenceLabel[group.state]}
              <span className="text-ink-faint/60 tabular-nums">{group.members.length}</span>
            </h3>

            <div className="flex flex-col gap-px">
              {group.members.map(({ user, role, lastReadAt }) => (
                <MemberRow
                  key={user.id}
                  user={user}
                  role={role}
                  isSelf={user.id === self?.id}
                  caughtUp={showReceipts && newestMessageAt > 0 && lastReadAt >= newestMessageAt}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}

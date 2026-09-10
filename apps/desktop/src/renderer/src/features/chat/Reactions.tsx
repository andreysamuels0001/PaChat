import { useState } from 'react';
import { SmilePlus } from 'lucide-react';
import { QUICK_REACTIONS, type Reaction } from '@pachat/shared';
import { cn } from '@/lib/cn';
import { Popover } from '@/components/ui/Overlay';
import { Tooltip } from '@/components/ui/Controls';
import { useChat } from '@/store/chat-store';
import { useSession } from '@/store/session-store';
import { toggleReaction } from '@/store/realtime';

/**
 * Reaction chips beneath a message.
 *
 * Each chip is a toggle, and the viewer's own reactions are visually distinct
 * — otherwise "has anyone already reacted with this?" requires hovering every
 * chip to read its tooltip.
 */
export function Reactions({ messageId, reactions }: { messageId: string; reactions: Reaction[] }) {
  const selfId = useSession((s) => s.self?.id);
  const users = useChat((s) => s.users);

  if (reactions.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {reactions.map((reaction) => {
        const mine = selfId ? reaction.userIds.includes(selfId) : false;
        const names = reaction.userIds
          .map((id) => (id === selfId ? 'You' : users.get(id)?.displayName))
          .filter((name): name is string => Boolean(name));

        // Name the first few reactors and summarise the rest, so a popular
        // reaction does not produce an unreadable tooltip.
        const label =
          names.length <= 4
            ? names.join(', ')
            : `${names.slice(0, 3).join(', ')} and ${names.length - 3} others`;

        return (
          <Tooltip key={reaction.emoji} content={`${label} reacted with ${reaction.emoji}`}>
            <button
              type="button"
              onClick={() => void toggleReaction(messageId, reaction.emoji)}
              className={cn(
                'flex h-[22px] items-center gap-1 rounded-full border px-1.5',
                'text-[11.5px] font-medium tabular-nums transition-colors',
                'duration-(--duration-fast) ease-(--ease-smooth)',
                mine
                  ? 'border-accent-500/45 bg-accent-500/18 text-accent-200'
                  : 'border-line bg-hover/70 text-ink-muted hover:border-line-strong hover:bg-hover',
              )}
            >
              <span className="text-[12.5px] leading-none">{reaction.emoji}</span>
              {reaction.count}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

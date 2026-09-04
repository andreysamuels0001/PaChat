import { useMemo, useState } from 'react';
import { ChevronDown, Hash, Lock, Plus, Settings, UserPlus } from 'lucide-react';
import { formatRelativeTime, messagePreview, type Conversation } from '@pachat/shared';
import { cn } from '@/lib/cn';
import { useTicker } from '@/lib/hooks';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Feedback';
import { IconButton } from '@/components/ui/Button';
import { Tooltip, shortcut } from '@/components/ui/Controls';
import { selectOrderedConversations, useChat } from '@/store/chat-store';
import { useSession } from '@/store/session-store';
import { useUi } from '@/store/ui-store';
import { openConversation, titleOf } from '@/store/realtime';
import { PresenceMenu } from './PresenceMenu';

/**
 * The navigation rail: channels, direct messages, and the viewer's own card.
 *
 * Conversations are grouped by kind rather than shown as one flat list,
 * because the two have different mental models — a channel is a place, a DM is
 * a person — and mixing them makes both harder to scan.
 */
export function Sidebar() {
  const conversations = useChat(selectOrderedConversations);
  const activeId = useChat((s) => s.activeConversationId);
  const openOverlay = useUi((s) => s.openOverlay);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const { channels, directs } = useMemo(() => {
    const channels: Conversation[] = [];
    const directs: Conversation[] = [];
    for (const conversation of conversations) {
      (conversation.kind === 'channel' ? channels : directs).push(conversation);
    }
    return { channels, directs };
  }, [conversations]);

  return (
    <nav
      className={cn('flex w-(--sidebar-width) shrink-0 flex-col bg-sunken/55 hairline-r')}
      aria-label="Conversations"
    >
      <div className="scroll-area flex-1 overflow-y-auto px-2 py-3">
        <Section
          title="Channels"
          count={channels.length}
          collapsed={collapsed.channels ?? false}
          onToggle={() => setCollapsed((c) => ({ ...c, channels: !c.channels }))}
          action={
            <Tooltip content="New channel" shortcut={shortcut('Mod+Shift+N')} placement="bottom">
              <IconButton label="New channel" size="xs" onClick={() => openOverlay('new-channel')}>
                <Plus />
              </IconButton>
            </Tooltip>
          }
        >
          {channels.map((conversation) => (
            <ConversationRow
              key={conversation.id}
              conversation={conversation}
              active={conversation.id === activeId}
            />
          ))}
        </Section>

        <Section
          title="Direct messages"
          count={directs.length}
          collapsed={collapsed.directs ?? false}
          onToggle={() => setCollapsed((c) => ({ ...c, directs: !c.directs }))}
          action={
            <Tooltip content="New message" placement="bottom">
              <IconButton label="New message" size="xs" onClick={() => openOverlay('new-direct')}>
                <UserPlus />
              </IconButton>
            </Tooltip>
          }
        >
          {directs.length === 0 ? (
            <p className="px-2 py-1.5 text-[12px] text-ink-faint">
              No conversations yet — start one from the member list.
            </p>
          ) : (
            directs.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                active={conversation.id === activeId}
              />
            ))
          )}
        </Section>
      </div>

      <SelfCard />
    </nav>
  );
}

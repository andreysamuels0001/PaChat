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

/* ───────────────────────────────────────────────────────────────── section ─*/

function Section({
  title,
  count,
  collapsed,
  onToggle,
  action,
  children,
}: {
  title: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4">
      <header className="group flex items-center gap-1 px-1.5 pb-1">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-1 rounded-xs py-0.5 text-left',
            'text-[11px] font-semibold tracking-[0.06em] text-ink-faint uppercase',
            'transition-colors hover:text-ink-dim',
          )}
        >
          <ChevronDown
            className={cn(
              'size-3 shrink-0 transition-transform duration-(--duration-fast)',
              collapsed && '-rotate-90',
            )}
          />
          <span className="truncate">{title}</span>
          <span className="text-ink-faint/60 tabular-nums">{count}</span>
        </button>
        <span className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {action}
        </span>
      </header>

      {!collapsed && <div className="flex flex-col gap-px">{children}</div>}
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────── row ──*/

function ConversationRow({
  conversation,
  active,
}: {
  conversation: Conversation;
  active: boolean;
}) {
  const users = useChat((s) => s.users);
  const typing = useChat((s) => s.typing.get(conversation.id));
  const selfId = useSession((s) => s.self?.id);
  useTicker(45_000);

  const title = titleOf(conversation);
  const unread = conversation.unreadCount;
  const hasUnread = unread > 0 && !conversation.isMuted;

  const peer =
    conversation.kind === 'direct'
      ? users.get(conversation.members.find((m) => m.userId !== selfId)?.userId ?? '')
      : undefined;

  const author = conversation.lastMessage
    ? users.get(conversation.lastMessage.authorId)
    : undefined;

  const preview = typing?.length
    ? 'typing…'
    : messagePreview(
        conversation.lastMessage,
        conversation.kind === 'channel' ? author?.displayName : undefined,
      );

  return (
    <button
      type="button"
      onClick={() => void openConversation(conversation.id)}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'group relative flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left',
        'transition-colors duration-(--duration-fast) ease-(--ease-smooth)',
        active ? 'bg-accent-500/14' : 'hover:bg-hover/70',
      )}
    >
      {/* Active indicator: a short bar rather than a full-height border, which
          reads as a selection rather than as a divider. */}
      {active && (
        <span className="absolute top-1/2 left-0 h-4 w-[2.5px] -translate-y-1/2 rounded-r-full bg-accent-400" />
      )}

      <span className="shrink-0">
        {conversation.kind === 'direct' && peer ? (
          <Avatar user={peer} size="md" showPresence />
        ) : (
          <span
            className={cn(
              'flex size-8 items-center justify-center rounded-md text-[15px]',
              active ? 'bg-accent-500/20' : 'bg-hover/80',
            )}
          >
            {conversation.icon ??
              (conversation.isPrivate ? (
                <Lock className="size-3.5 text-ink-dim" />
              ) : (
                <Hash className="size-3.5 text-ink-dim" />
              ))}
          </span>
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-[13.5px] tracking-tight',
              hasUnread
                ? 'font-semibold text-ink'
                : active
                  ? 'font-medium text-ink'
                  : 'text-ink-muted',
            )}
          >
            {conversation.kind === 'channel' ? `# ${title}` : title}
          </span>
          {conversation.lastMessage && (
            <span className="shrink-0 text-[11px] tabular-nums text-ink-faint">
              {formatRelativeTime(conversation.lastMessage.createdAt)}
            </span>
          )}
        </span>

        <span className="mt-0.5 flex items-center gap-2">
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-[12px]',
              typing?.length ? 'text-accent-300 italic' : 'text-ink-faint',
            )}
          >
            {preview}
          </span>
          {conversation.hasUnreadMention && !conversation.isMuted ? (
            <Badge count={unread} tone="danger" />
          ) : (
            hasUnread && <Badge count={unread} />
          )}
          {conversation.isMuted && unread > 0 && (
            <span className="size-1.5 shrink-0 rounded-full bg-ink-faint" aria-label="Muted" />
          )}
        </span>
      </span>
    </button>
  );
}

/* ───────────────────────────────────────────────────────────── self card ──*/

function SelfCard() {
  const self = useSession((s) => s.self);
  const openOverlay = useUi((s) => s.openOverlay);
  const [menuOpen, setMenuOpen] = useState(false);

  if (!self) return null;

  return (
    <div className="relative flex items-center gap-2 p-2 hairline-t">
      <button
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left',
          'transition-colors hover:bg-hover/70',
        )}
      >
        <Avatar user={self} size="md" showPresence />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-ink">
            {self.displayName}
          </span>
          <span className="block truncate text-[11.5px] text-ink-faint">
            {self.presence.message ?? `@${self.username}`}
          </span>
        </span>
      </button>

      <Tooltip content="Settings" shortcut={shortcut('Mod+,')} placement="top">
        <IconButton label="Settings" onClick={() => openOverlay('settings')}>
          <Settings />
        </IconButton>
      </Tooltip>

      <PresenceMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}

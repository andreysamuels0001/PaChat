import { useState } from 'react';
import { Bell, BellOff, Hash, LogOut, Lock, Pin, PinOff, Users } from 'lucide-react';
import { formatRelativeTime, type Conversation } from '@pachat/shared';
import { cn } from '@/lib/cn';
import { Avatar, presenceLabel } from '@/components/ui/Avatar';
import { Button, IconButton } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Overlay';
import { Tooltip, shortcut } from '@/components/ui/Controls';
import { useChat } from '@/store/chat-store';
import { useSession } from '@/store/session-store';
import { useUi } from '@/store/ui-store';
import { leaveConversation, setConversationFlags, titleOf } from '@/store/realtime';

/**
 * The conversation header.
 *
 * For a channel it shows the name, topic and member count; for a direct
 * message it shows the person, their presence and their status line — the
 * information that actually tells you whether now is a good time to write.
 */
export function ConversationHeader({ conversation }: { conversation: Conversation }) {
  const users = useChat((s) => s.users);
  const selfId = useSession((s) => s.self?.id);
  const showMembers = useUi((s) => s.showMembers);
  const toggleMembers = useUi((s) => s.toggleMembers);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const isChannel = conversation.kind === 'channel';
  const peer = isChannel
    ? undefined
    : users.get(conversation.members.find((m) => m.userId !== selfId)?.userId ?? '');

  const title = titleOf(conversation);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 px-6 hairline-b">
      {isChannel ? (
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-md bg-hover/80 text-[16px]',
          )}
        >
          {conversation.icon ??
            (conversation.isPrivate ? (
              <Lock className="size-4 text-ink-dim" />
            ) : (
              <Hash className="size-4 text-ink-dim" />
            ))}
        </span>
      ) : (
        peer && <Avatar user={peer} size="md" showPresence />
      )}

      <div className="min-w-0 flex-1">
        <h1 className="flex items-center gap-2 truncate text-[14.5px] font-semibold tracking-tight text-ink">
          {isChannel ? `#${title}` : title}
          {conversation.isPrivate && isChannel && (
            <Lock className="size-3 shrink-0 text-ink-faint" aria-label="Private channel" />
          )}
        </h1>

        <p className="truncate text-[12px] text-ink-faint">
          {isChannel ? (
            (conversation.topic ??
            `${conversation.members.length} member${conversation.members.length === 1 ? '' : 's'}`)
          ) : peer ? (
            <>
              {peer.presence.message ?? presenceLabel[peer.presence.state]}
              {peer.presence.state === 'offline' && (
                <span className="text-ink-faint">
                  {' '}
                  · last seen {formatRelativeTime(peer.presence.lastSeenAt)} ago
                </span>
              )}
            </>
          ) : (
            'Direct message'
          )}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <Tooltip content={conversation.isPinned ? 'Unpin' : 'Pin to top'}>
          <IconButton
            label={conversation.isPinned ? 'Unpin conversation' : 'Pin conversation'}
            active={conversation.isPinned}
            onClick={() =>
              void setConversationFlags(conversation.id, { pinned: !conversation.isPinned })
            }
          >
            {conversation.isPinned ? <PinOff /> : <Pin />}
          </IconButton>
        </Tooltip>

        <Tooltip content={conversation.isMuted ? 'Unmute' : 'Mute notifications'}>
          <IconButton
            label={conversation.isMuted ? 'Unmute conversation' : 'Mute conversation'}
            active={conversation.isMuted}
            onClick={() =>
              void setConversationFlags(conversation.id, { muted: !conversation.isMuted })
            }
          >
            {conversation.isMuted ? <BellOff /> : <Bell />}
          </IconButton>
        </Tooltip>

        <Tooltip content="Members" shortcut={shortcut('Mod+Shift+M')}>
          <IconButton label="Toggle member list" active={showMembers} onClick={toggleMembers}>
            <Users />
          </IconButton>
        </Tooltip>

        {isChannel && (
          <Tooltip content="Leave channel">
            <IconButton label="Leave channel" onClick={() => setConfirmLeave(true)}>
              <LogOut />
            </IconButton>
          </Tooltip>
        )}
      </div>

      <Modal
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        title={`Leave #${title}?`}
        description="You will stop receiving messages from this channel. You can rejoin later if it is public."
        width="max-w-md"
        footer={
          <>
            <Button onClick={() => setConfirmLeave(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                void leaveConversation(conversation.id);
                setConfirmLeave(false);
              }}
            >
              Leave channel
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-ink-muted">
          {conversation.members.length === 1
            ? 'You are the last member — the channel will be removed entirely.'
            : `${conversation.members.length - 1} other member${
                conversation.members.length === 2 ? '' : 's'
              } will remain.`}
        </p>
      </Modal>
    </header>
  );
}

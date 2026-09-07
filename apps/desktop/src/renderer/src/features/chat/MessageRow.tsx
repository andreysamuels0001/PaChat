import { memo, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CornerUpLeft, Loader2, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { formatClockTime, LIMITS, truncate, type Message, type User } from '@pachat/shared';
import { cn } from '@/lib/cn';
import { renderMessageBody } from '@/lib/markup';
import { Avatar } from '@/components/ui/Avatar';
import { IconButton } from '@/components/ui/Button';
import { Popover } from '@/components/ui/Overlay';
import { Tooltip } from '@/components/ui/Controls';
import { useChat, type PendingMessage } from '@/store/chat-store';
import { useSession } from '@/store/session-store';
import { useUi } from '@/store/ui-store';
import {
  deleteMessage,
  discardPending,
  editMessage,
  openDirectMessage,
  retrySend,
} from '@/store/realtime';
import { Attachments } from './Attachments';
import { ReactionPicker, Reactions } from './Reactions';

/**
 * One message in the log.
 *
 * Two layouts, chosen by `grouped`: a full row with avatar and author, or a
 * continuation that aligns under it and shows only a hover timestamp. The
 * gutter width is identical in both, so a sequence of grouped messages forms a
 * single clean text column.
 *
 * Memoised because a channel renders hundreds of these and a typing indicator
 * elsewhere in the tree must not re-render them all.
 */

export interface MessageRowProps {
  message: Message;
  author: User | undefined;
  grouped: boolean;
  compact: boolean;
  /** Highlighted after being jumped to from search. */
  flashed?: boolean;
}

export const MessageRow = memo(function MessageRow({
  message,
  author,
  grouped,
  compact,
  flashed,
}: MessageRowProps) {
  const self = useSession((s) => s.self);
  const users = useChat((s) => s.users);
  const editing = useUi((s) => s.editing === message.id);
  const setReplyTo = useUi((s) => s.setReplyTo);
  const setEditing = useUi((s) => s.setEditing);
  const [menuOpen, setMenuOpen] = useState(false);

  if (message.kind === 'system') {
    return <SystemNotice message={message} author={author} />;
  }

  const isMine = self?.id === message.authorId;
  const isDeleted = message.deletedAt !== null;
  const canEdit = isMine && !isDeleted && Date.now() - message.createdAt < 24 * 60 * 60 * 1000;

  return (
    <article
      className={cn(
        'group relative flex gap-3 px-6 transition-colors duration-(--duration-base)',
        grouped ? (compact ? 'py-px' : 'py-0.5') : compact ? 'pt-2 pb-px' : 'pt-3.5 pb-0.5',
        'hover:bg-hover/35',
        flashed && 'bg-accent-500/10',
      )}
      data-message-id={message.id}
    >
      {/* Gutter: avatar on a leading row, hover timestamp on a continuation. */}
      <div className="w-8 shrink-0">
        {grouped ? (
          <time
            dateTime={new Date(message.createdAt).toISOString()}
            className={cn(
              'mt-[3px] block text-right text-[10.5px] leading-5 tabular-nums',
              'text-ink-faint opacity-0 transition-opacity group-hover:opacity-100',
            )}
          >
            {formatClockTime(message.createdAt)}
          </time>
        ) : author ? (
          <Avatar user={author} size="md" showPresence />
        ) : (
          <div className="size-8 rounded-full bg-hover" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        {message.replyTo && <ReplyContext message={message} />}

        {!grouped && (
          <header className="flex items-baseline gap-2">
            <button
              type="button"
              onClick={() => author && !isMine && void openDirectMessage(author.id)}
              className={cn(
                'text-[13.5px] font-semibold tracking-tight text-ink',
                !isMine && author && 'hover:underline',
              )}
              style={author ? { color: `var(--c-user-${author.accentColor})` } : undefined}
            >
              {author?.displayName ?? 'Unknown member'}
            </button>
            {author?.title && (
              <span className="hidden text-[11px] text-ink-faint sm:inline">{author.title}</span>
            )}
            <time
              dateTime={new Date(message.createdAt).toISOString()}
              className="text-[11px] tabular-nums text-ink-faint"
            >
              {formatClockTime(message.createdAt)}
            </time>
          </header>
        )}

        {isDeleted ? (
          <p className="text-[13.5px] text-ink-faint italic">This message was deleted</p>
        ) : editing ? (
          <InlineEditor
            messageId={message.id}
            initial={message.body}
            onDone={() => setEditing(null)}
          />
        ) : (
          <>
            <div className="message-body text-[13.5px] leading-[1.55] text-ink">
              {renderMessageBody(message.body, {
                selfUsername: self?.username ?? '',
                resolveMention: (handle) =>
                  [...users.values()].find((u) => u.username === handle)?.displayName ?? null,
                onMentionClick: (handle) => {
                  const user = [...users.values()].find((u) => u.username === handle);
                  if (user && user.id !== self?.id) void openDirectMessage(user.id);
                },
              })}
              {message.editedAt && (
                <span className="ml-1.5 align-baseline text-[10.5px] text-ink-faint select-none">
                  (edited)
                </span>
              )}
            </div>

            <Attachments attachments={message.attachments} />
            <Reactions messageId={message.id} reactions={message.reactions} />
          </>
        )}
      </div>

      {/* Hover toolbar. Absolutely positioned and overlapping the row above so
          it never changes the message's own height on hover. */}
      {!isDeleted && !editing && (
        <div
          className={cn(
            'absolute -top-3.5 right-6 z-10 flex items-center gap-0.5 rounded-md',
            'border border-line bg-overlay p-0.5 shadow-elevation-md',
            'opacity-0 transition-opacity duration-(--duration-fast)',
            'group-hover:opacity-100 focus-within:opacity-100',
            menuOpen && 'opacity-100',
          )}
        >
          <ReactionPicker messageId={message.id} />

          <Tooltip content="Reply">
            <IconButton label="Reply" onClick={() => setReplyTo(message)}>
              <CornerUpLeft />
            </IconButton>
          </Tooltip>

          {(canEdit || isMine) && (
            <span className="relative inline-flex">
              <IconButton
                label="More actions"
                active={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
              >
                <MoreHorizontal />
              </IconButton>

              <Popover open={menuOpen} onClose={() => setMenuOpen(false)} align="end" side="bottom">
                <div className="w-44 p-1">
                  {canEdit && (
                    <MenuItem
                      icon={<Pencil />}
                      label="Edit message"
                      onClick={() => {
                        setEditing(message.id);
                        setMenuOpen(false);
                      }}
                    />
                  )}
                  <MenuItem
                    icon={<Trash2 />}
                    label="Delete message"
                    danger
                    onClick={() => {
                      void deleteMessage(message.id);
                      setMenuOpen(false);
                    }}
                  />
                </div>
              </Popover>
            </span>
          )}
        </div>
      )}
    </article>
  );
});

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

/* ─────────────────────────────────────────────────────────── reply quote ───*/

function ReplyContext({ message }: { message: Message }) {
  const users = useChat((s) => s.users);
  const parent = message.replyTo;
  if (!parent) return null;

  const author = users.get(parent.authorId);

  return (
    <button
      type="button"
      onClick={() => {
        // Scroll the quoted message into view rather than opening a thread
        // pane: in a flat log, context is almost always a few rows up.
        document
          .querySelector(`[data-message-id="${parent.id}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }}
      className={cn(
        'mb-1 flex max-w-full items-center gap-1.5 text-left',
        'text-[11.5px] text-ink-dim transition-colors hover:text-ink-muted',
      )}
    >
      <span
        className="h-3 w-4 shrink-0 rounded-tl-sm border-t-2 border-l-2"
        style={{
          borderColor: author
            ? `color-mix(in oklab, var(--c-user-${author.accentColor}) 55%, transparent)`
            : 'var(--c-border-strong)',
        }}
        aria-hidden
      />
      <span
        className="shrink-0 font-medium"
        style={author ? { color: `var(--c-user-${author.accentColor})` } : undefined}
      >
        {author?.displayName ?? 'Unknown'}
      </span>
      <span className={cn('min-w-0 truncate', parent.isDeleted && 'italic')}>
        {truncate(parent.excerpt, 90)}
      </span>
    </button>
  );
}

/* ──────────────────────────────────────────────────────────── system note ──*/

function SystemNotice({ message, author }: { message: Message; author: User | undefined }) {
  return (
    <div className="flex items-center gap-2 px-6 py-1.5 text-[12px] text-ink-faint">
      <span className="h-px flex-1 bg-[var(--c-border-subtle)]" />
      <span className="shrink-0">
        <span className="font-medium text-ink-dim">{author?.displayName ?? 'Someone'}</span>{' '}
        {message.body}
      </span>
      <time dateTime={new Date(message.createdAt).toISOString()} className="shrink-0 tabular-nums">
        {formatClockTime(message.createdAt)}
      </time>
      <span className="h-px flex-1 bg-[var(--c-border-subtle)]" />
    </div>
  );
}

/* ───────────────────────────────────────────────────────── inline editor ───*/

function InlineEditor({
  messageId,
  initial,
  onDone,
}: {
  messageId: string;
  initial: string;
  onDone: () => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.focus();
    // Place the caret at the end rather than selecting everything, so the
    // first keystroke appends instead of replacing the message.
    element.setSelectionRange(element.value.length, element.value.length);
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`;
  }, []);

  const save = (): void => {
    const next = value.trim();
    if (next.length === 0 || next === initial) {
      onDone();
      return;
    }
    void editMessage(messageId, next);
  };

  return (
    <div className="mt-0.5">
      <textarea
        ref={ref}
        value={value}
        maxLength={LIMITS.messageBody}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onDone();
          }
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            save();
          }
        }}
        className={cn(
          'w-full resize-none rounded-md border border-accent-500/50 bg-sunken px-3 py-2',
          'text-[13.5px] leading-[1.55] text-ink outline-none selectable',
          'shadow-[0_0_0_3px_color-mix(in_oklab,var(--c-accent-500)_14%,transparent)]',
        )}
      />
      <p className="mt-1 text-[11px] text-ink-faint">
        <kbd className="font-sans font-semibold">Enter</kbd> to save ·{' '}
        <kbd className="font-sans font-semibold">Esc</kbd> to cancel
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────── pending message ───*/

/**
 * An optimistic message, rendered before the server has acknowledged it.
 *
 * Shown at reduced opacity while in flight. On failure it stays put with a
 * retry affordance — the text is never silently lost, and because the retry
 * reuses the original nonce the server deduplicates it rather than creating a
 * second copy.
 */
export function PendingRow({
  pending,
  author,
  grouped,
  compact,
}: {
  pending: PendingMessage;
  author: User | undefined;
  grouped: boolean;
  compact: boolean;
}) {
  const failed = pending.state === 'failed';

  return (
    <article
      className={cn(
        'group relative flex gap-3 px-6',
        grouped ? (compact ? 'py-px' : 'py-0.5') : compact ? 'pt-2 pb-px' : 'pt-3.5 pb-0.5',
      )}
    >
      <div className="w-8 shrink-0">{!grouped && author && <Avatar user={author} size="md" />}</div>

      <div className={cn('min-w-0 flex-1', !failed && 'opacity-55')}>
        {!grouped && (
          <header className="flex items-baseline gap-2">
            <span
              className="text-[13.5px] font-semibold tracking-tight"
              style={author ? { color: `var(--c-user-${author.accentColor})` } : undefined}
            >
              {author?.displayName ?? 'You'}
            </span>
            <span className="flex items-center gap-1 text-[11px] text-ink-faint">
              {failed ? (
                <AlertTriangle className="size-3 text-danger" />
              ) : (
                <Loader2 className="size-3 animate-spin" />
              )}
              {failed ? 'Not sent' : 'Sending'}
            </span>
          </header>
        )}

        <div className="message-body text-[13.5px] leading-[1.55] text-ink">{pending.body}</div>

        {pending.attachments.length > 0 && <Attachments attachments={pending.attachments} />}

        {failed && (
          <div className="mt-1.5 flex items-center gap-2 text-[11.5px]">
            <span className="text-danger">{pending.error ?? 'Delivery failed'}</span>
            <button
              type="button"
              onClick={() => void retrySend(pending.nonce)}
              className="font-medium text-accent-300 hover:underline"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => discardPending(pending.nonce)}
              className="font-medium text-ink-dim hover:underline"
            >
              Discard
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

/* ──────────────────────────────────────────────────────────────── helpers ──*/

function MenuItem({
  icon,
  label,
  danger,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-[12.5px]',
        'transition-colors [&>span>svg]:size-3.5',
        danger ? 'text-danger hover:bg-danger/12' : 'text-ink-muted hover:bg-hover hover:text-ink',
      )}
    >
      <span className="shrink-0">{icon}</span>
      {label}
    </button>
  );
}

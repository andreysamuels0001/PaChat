import { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown, Hash, MessageSquareDashed } from 'lucide-react';
import { formatDayLabel, isGroupedWith, type Conversation, type Message } from '@pachat/shared';
import { cn } from '@/lib/cn';
import { useOnReachTop, useStickyScroll } from '@/lib/hooks';
import { EmptyState, MessageSkeleton, Spinner } from '@/components/ui/Feedback';
import { useChat } from '@/store/chat-store';
import { useSession } from '@/store/session-store';
import { useUi } from '@/store/ui-store';
import { loadOlderMessages, titleOf } from '@/store/realtime';
import { MessageRow, PendingRow } from './MessageRow';
import { TypingIndicator } from './TypingIndicator';

/**
 * The scrollable message log.
 *
 * Three behaviours do most of the work here:
 *
 *  · Grouping — consecutive messages from one author within five minutes
 *    collapse into a single visual block, which is what turns a transcript
 *    into something readable.
 *  · Day separators — inserted whenever the calendar date changes, so "11:04"
 *    is never ambiguous.
 *  · Sticky scroll — the view follows new messages only while the reader is
 *    already at the bottom; scrollback is never interrupted.
 */

type Row =
  | { kind: 'day'; key: string; timestamp: number }
  | { kind: 'unread'; key: string; count: number }
  | { kind: 'message'; key: string; message: Message; grouped: boolean };

export function MessageList({ conversation }: { conversation: Conversation }) {
  const messages = useChat((s) => s.messages.get(conversation.id));
  const history = useChat((s) => s.history.get(conversation.id));
  const pending = useChat((s) => s.pending);
  const users = useChat((s) => s.users);
  const unreadMark = useChat((s) => s.unreadMarks.get(conversation.id));
  const selfId = useSession((s) => s.self?.id);
  const compact = useUi((s) => s.compact);

  const conversationPending = useMemo(
    () => pending.filter((p) => p.conversationId === conversation.id),
    [pending, conversation.id],
  );

  // Re-flow only when the message set actually changes, not on every store
  // update: this loop runs over the whole rendered window.
  const rows = useMemo(
    () => buildRows(messages ?? [], unreadMark, selfId),
    [messages, unreadMark, selfId],
  );

  const { ref, atBottom, onScroll, scrollToBottom } = useStickyScroll<HTMLDivElement>(
    `${messages?.length ?? 0}:${conversationPending.length}`,
  );

  useOnReachTop(ref, () => void loadOlderMessages(conversation.id), {
    enabled: (history?.hasMore ?? false) && !(history?.loading ?? false),
  });

  if (!history?.loaded) return <MessageSkeleton />;

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={ref}
        onScroll={onScroll}
        className="scroll-area h-full overflow-y-auto overscroll-contain pb-2"
      >
        {history.hasMore ? (
          <div className="flex h-12 items-center justify-center gap-2 text-[12px] text-ink-faint">
            {history.loading ? (
              <>
                <Spinner className="size-3.5" />
                Loading earlier messages
              </>
            ) : (
              'Scroll up for more history'
            )}
          </div>
        ) : (
          <ConversationStart conversation={conversation} />
        )}

        {rows.length === 0 && !history.hasMore && (
          <div className="py-10">
            <EmptyState
              icon={<MessageSquareDashed />}
              title="No messages yet"
              description="Say something to get this conversation started."
            />
          </div>
        )}

        {rows.map((row) => {
          if (row.kind === 'day') {
            return <DaySeparator key={row.key} timestamp={row.timestamp} />;
          }
          if (row.kind === 'unread') {
            return <UnreadDivider key={row.key} count={row.count} />;
          }
          return (
            <MessageRow
              key={row.key}
              message={row.message}
              author={users.get(row.message.authorId)}
              grouped={row.grouped}
              compact={compact}
            />
          );
        })}

        {conversationPending.map((item, index) => {
          const previousAuthor =
            index > 0
              ? conversationPending[index - 1]!.authorId
              : (messages?.[messages.length - 1]?.authorId ?? null);
          return (
            <PendingRow
              key={item.nonce}
              pending={item}
              author={users.get(item.authorId)}
              grouped={previousAuthor === item.authorId}
              compact={compact}
            />
          );
        })}

        <TypingIndicator conversationId={conversation.id} />
      </div>

      {/* Jump-to-latest. Appears only when the reader has scrolled away, and
          surfaces the unread count so it doubles as a "you have missed N"
          signal. */}
      <AnimatePresence>
        {!atBottom && (
          <motion.button
            type="button"
            onClick={() => scrollToBottom()}
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'absolute right-6 bottom-4 flex items-center gap-2 rounded-full',
              'border border-line glass px-3 py-2 text-[12px] font-medium text-ink',
              'shadow-elevation-lg',
            )}
          >
            <ArrowDown className="size-3.5" />
            {conversation.unreadCount > 0
              ? `${conversation.unreadCount} new message${conversation.unreadCount === 1 ? '' : 's'}`
              : 'Jump to latest'}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────── row builder ─*/

/**
 * Flattens messages into a render list, interleaving day separators and the
 * unread divider.
 *
 * The divider is placed before the first message newer than the frozen read
 * mark, and only when that message is not the viewer's own — your own send
 * should never be announced to you as unread.
 */
function buildRows(
  messages: Message[],
  unreadMark: number | undefined,
  selfId: string | undefined,
): Row[] {
  const rows: Row[] = [];
  let lastDay = '';
  let dividerPlaced = unreadMark === undefined;
  let unreadCount = 0;

  if (unreadMark !== undefined) {
    unreadCount = messages.filter((m) => m.createdAt > unreadMark && m.authorId !== selfId).length;
    if (unreadCount === 0) dividerPlaced = true;
  }

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]!;
    const day = new Date(message.createdAt).toDateString();

    if (day !== lastDay) {
      rows.push({ kind: 'day', key: `day-${day}`, timestamp: message.createdAt });
      lastDay = day;
    }

    if (
      !dividerPlaced &&
      unreadMark !== undefined &&
      message.createdAt > unreadMark &&
      message.authorId !== selfId
    ) {
      rows.push({ kind: 'unread', key: `unread-${message.id}`, count: unreadCount });
      dividerPlaced = true;
    }

    // A day separator or the unread divider always breaks grouping, otherwise
    // the first message after it would render without an avatar.
    const previous = messages[index - 1];
    const brokeByDivider = rows[rows.length - 1]?.kind !== 'message';
    rows.push({
      kind: 'message',
      key: message.id,
      message,
      grouped: !brokeByDivider && isGroupedWith(message, previous),
    });
  }

  return rows;
}

/* ───────────────────────────────────────────────────────────────── pieces ──*/

function DaySeparator({ timestamp }: { timestamp: number }) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-3 px-6 py-2 backdrop-blur-sm">
      <span className="h-px flex-1 bg-[var(--c-border-subtle)]" />
      <span
        className={cn(
          'shrink-0 rounded-full border border-line-subtle bg-raised px-2.5 py-0.5',
          'text-[11px] font-medium text-ink-dim',
        )}
      >
        {formatDayLabel(timestamp)}
      </span>
      <span className="h-px flex-1 bg-[var(--c-border-subtle)]" />
    </div>
  );
}

function UnreadDivider({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-3 px-6 py-1.5">
      <span className="h-px flex-1 bg-danger/45" />
      <span className="shrink-0 rounded-full bg-danger px-2 py-0.5 text-[10.5px] font-bold tracking-wide text-black/85 uppercase">
        {count} new
      </span>
    </div>
  );
}

/** The header shown once the top of a conversation has been reached. */
function ConversationStart({ conversation }: { conversation: Conversation }) {
  const title = titleOf(conversation);

  return (
    <div className="px-6 pt-10 pb-6">
      <div
        className={cn(
          'flex size-12 items-center justify-center rounded-xl text-[22px]',
          'border border-line-subtle bg-raised',
        )}
      >
        {conversation.icon ?? <Hash className="size-5 text-ink-dim" />}
      </div>
      <h2 className="mt-4 text-[22px] font-semibold tracking-[-0.02em] text-ink">
        {conversation.kind === 'channel' ? `#${title}` : title}
      </h2>
      <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-dim">
        {conversation.topic ??
          (conversation.kind === 'channel'
            ? 'This is the very beginning of the channel.'
            : 'This is the beginning of your direct message history.')}
      </p>
    </div>
  );
}

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

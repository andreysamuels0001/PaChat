import { AnimatePresence, motion } from 'framer-motion';
import { formatTypingSentence } from '@pachat/shared';
import { cn } from '@/lib/cn';
import { Avatar } from '@/components/ui/Avatar';
import { useChat } from '@/store/chat-store';

/**
 * Live typing indicator.
 *
 * Reserves no space when idle, so the message log does not shift by a row
 * every time someone starts and stops typing. The dots are a transform-only
 * animation with a staggered delay, which costs nothing on the compositor.
 */
export function TypingIndicator({ conversationId }: { conversationId: string }) {
  const typingIds = useChat((s) => s.typing.get(conversationId));
  const users = useChat((s) => s.users);

  const typists = (typingIds ?? [])
    .map((id) => users.get(id))
    .filter((user): user is NonNullable<typeof user> => Boolean(user));

  const sentence = formatTypingSentence(typists.map((user) => user.displayName));

  return (
    <AnimatePresence>
      {sentence && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 28 }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-center gap-2 overflow-hidden px-6"
          aria-live="polite"
        >
          <div className="flex items-center -space-x-1.5">
            {typists.slice(0, 3).map((user) => (
              <div key={user.id} className="rounded-full ring-2 ring-base">
                <Avatar user={user} size="xs" />
              </div>
            ))}
          </div>

          <span className="flex items-center gap-1" aria-hidden>
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className="size-1 rounded-full bg-ink-dim"
                style={{
                  animation: 'typing-bounce 1.3s var(--ease-in-out) infinite',
                  animationDelay: `${index * 0.14}s`,
                }}
              />
            ))}
          </span>

          <span className={cn('truncate text-[12px] text-ink-dim italic')}>{sentence}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

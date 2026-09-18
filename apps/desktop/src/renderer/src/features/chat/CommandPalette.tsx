import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Hash, MessageSquare, Search, Settings, Users } from 'lucide-react';
import { formatRelativeTime, type Conversation, type SearchHit, type User } from '@pachat/shared';
import { cn } from '@/lib/cn';
import { useDebounced } from '@/lib/hooks';
import { Modal } from '@/components/ui/Overlay';
import { Avatar } from '@/components/ui/Avatar';
import { Kbd } from '@/components/ui/Controls';
import { Spinner } from '@/components/ui/Feedback';
import { selectOrderedConversations, useChat } from '@/store/chat-store';
import { useSession } from '@/store/session-store';
import { useUi } from '@/store/ui-store';
import { openConversation, openDirectMessage, searchMessages, titleOf } from '@/store/realtime';

/**
 * The command palette: one entry point for navigation and search.
 *
 * Typing filters conversations and members locally — instant, no round-trip.
 * Once the query is long enough it *also* runs a server-side full-text search
 * over message bodies, and those results are appended below. Local results
 * never wait on the network, so the palette always feels immediate.
 */

type Item =
  | { kind: 'conversation'; id: string; conversation: Conversation }
  | { kind: 'member'; id: string; user: User }
  | { kind: 'message'; id: string; hit: SearchHit }
  | { kind: 'action'; id: string; label: string; icon: React.ReactNode; run: () => void };

export function CommandPalette() {
  const open = useUi((s) => s.overlay === 'palette');
  const closeOverlay = useUi((s) => s.closeOverlay);
  const openOverlay = useUi((s) => s.openOverlay);

  const conversations = useChat(selectOrderedConversations);
  const users = useChat((s) => s.users);
  const hits = useChat((s) => s.searchResults);
  const selfId = useSession((s) => s.self?.id);

  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [searching, setSearching] = useState(false);
  const debounced = useDebounced(query, 220);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset on open so the palette never reopens showing a stale query.
  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open || debounced.trim().length < 2) return;
    setSearching(true);
    void searchMessages(debounced).finally(() => setSearching(false));
  }, [debounced, open]);

  const items = useMemo<Item[]>(() => {
    const needle = query.trim().toLowerCase();
    const result: Item[] = [];

    const matchingConversations = conversations.filter((conversation) => {
      if (needle.length === 0) return true;
      const title = titleOf(conversation).toLowerCase();
      return title.includes(needle) || (conversation.topic ?? '').toLowerCase().includes(needle);
    });

    for (const conversation of matchingConversations.slice(0, needle ? 6 : 8)) {
      result.push({ kind: 'conversation', id: `c-${conversation.id}`, conversation });
    }

    if (needle.length > 0) {
      const matchingUsers = [...users.values()].filter(
        (user) =>
          user.id !== selfId &&
          (user.displayName.toLowerCase().includes(needle) || user.username.includes(needle)),
      );
      for (const user of matchingUsers.slice(0, 5)) {
        result.push({ kind: 'member', id: `u-${user.id}`, user });
      }

      for (const hit of hits.slice(0, 8)) {
        result.push({ kind: 'message', id: `m-${hit.message.id}`, hit });
      }
    } else {
      result.push({
        kind: 'action',
        id: 'a-new-channel',
        label: 'Create a channel',
        icon: <Hash />,
        run: () => openOverlay('new-channel'),
      });
      result.push({
        kind: 'action',
        id: 'a-new-direct',
        label: 'Start a direct message',
        icon: <Users />,
        run: () => openOverlay('new-direct'),
      });
      result.push({
        kind: 'action',
        id: 'a-settings',
        label: 'Open settings',
        icon: <Settings />,
        run: () => openOverlay('settings'),
      });
    }

    return result;
  }, [query, conversations, users, hits, selfId, openOverlay]);

  // Clamp rather than reset, so arrowing past the end wraps predictably when
  // the result set shrinks under the cursor.
  const active = Math.min(cursor, Math.max(0, items.length - 1));

  const activate = (item: Item | undefined): void => {
    if (!item) return;

    switch (item.kind) {
      case 'conversation':
        void openConversation(item.conversation.id);
        break;
      case 'member':
        void openDirectMessage(item.user.id);
        break;
      case 'message':
        void openConversation(item.hit.message.conversationId).then(() => {
          // Defer until the log has painted, then bring the match into view.
          requestAnimationFrame(() => {
            document
              .querySelector(`[data-message-id="${item.hit.message.id}"]`)
              ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          });
        });
        break;
      case 'action':
        item.run();
        return; // the action opens its own overlay
    }

    closeOverlay();
  };

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((c) => (c + 1) % Math.max(1, items.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((c) => (c - 1 + items.length) % Math.max(1, items.length));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      activate(items[active]);
    }
  };

  // Keep the highlighted row visible while arrowing through a long list.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <Modal open={open} onClose={closeOverlay} bare width="max-w-xl">
      <div className="flex items-center gap-3 px-4 py-3.5 hairline-b">
        <Search className="size-4 shrink-0 text-ink-dim" aria-hidden />
        <input
          data-autofocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setCursor(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Jump to a conversation, find a person, or search messages…"
          className={cn(
            'min-w-0 flex-1 bg-transparent text-[14.5px] text-ink outline-none selectable',
            'placeholder:text-ink-faint',
          )}
        />
        {searching && <Spinner className="size-3.5" />}
        <Kbd>Esc</Kbd>
      </div>

      <div ref={listRef} className="scroll-area max-h-[52vh] overflow-y-auto p-1.5">
        {items.length === 0 ? (
          <p className="px-3 py-8 text-center text-[13px] text-ink-faint">
            Nothing matches “{query.trim()}”.
          </p>
        ) : (
          items.map((item, index) => (
            <Row
              key={item.id}
              item={item}
              index={index}
              active={index === active}
              onHover={() => setCursor(index)}
              onSelect={() => activate(item)}
            />
          ))
        )}
      </div>

      <footer className="flex items-center gap-3 px-4 py-2.5 text-[11px] text-ink-faint hairline-t">
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> navigate
        </span>
        <span className="flex items-center gap-1">
          <Kbd>↵</Kbd> open
        </span>
        <span className="ml-auto">
          {query.trim().length >= 2
            ? `${hits.length} message${hits.length === 1 ? '' : 's'} matched`
            : 'Type at least 2 characters to search messages'}
        </span>
      </footer>
    </Modal>
  );
}

/* ─────────────────────────────────────────────────────────────────── row ───*/

function Row({
  item,
  index,
  active,
  onHover,
  onSelect,
}: {
  item: Item;
  index: number;
  active: boolean;
  onHover: () => void;
  onSelect: () => void;
}) {
  const users = useChat((s) => s.users);

  return (
    <button
      type="button"
      data-index={index}
      onMouseMove={onHover}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left',
        'transition-colors duration-(--duration-fast)',
        active ? 'bg-accent-500/16' : 'hover:bg-hover/60',
      )}
    >
      {item.kind === 'conversation' && (
        <>
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-hover/80 text-[14px]">
            {item.conversation.icon ?? <Hash className="size-3.5 text-ink-dim" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-medium text-ink">
              {item.conversation.kind === 'channel'
                ? `#${titleOf(item.conversation)}`
                : titleOf(item.conversation)}
            </span>
            {item.conversation.topic && (
              <span className="block truncate text-[11.5px] text-ink-faint">
                {item.conversation.topic}
              </span>
            )}
          </span>
        </>
      )}

      {item.kind === 'member' && (
        <>
          <Avatar user={item.user} size="sm" showPresence />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-medium text-ink">
              {item.user.displayName}
            </span>
            <span className="block truncate text-[11.5px] text-ink-faint">
              @{item.user.username}
            </span>
          </span>
          <MessageSquare className="size-3.5 shrink-0 text-ink-faint" />
        </>
      )}

      {item.kind === 'message' && (
        <>
          <span className="w-7 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              <span className="truncate text-[12px] font-medium text-ink-muted">
                {users.get(item.hit.message.authorId)?.displayName ?? 'Unknown'}
              </span>
              <span className="shrink-0 text-[11px] text-ink-faint">
                {formatRelativeTime(item.hit.message.createdAt)}
              </span>
            </span>
            {/* The highlight markup is produced and escaped by the server,
                which wraps only matched terms in <mark>. */}
            <span
              className="mt-0.5 block truncate text-[12.5px] text-ink-dim"
              dangerouslySetInnerHTML={{ __html: item.hit.highlight }}
            />
          </span>
          <ArrowRight className="size-3.5 shrink-0 text-ink-faint" />
        </>
      )}

      {item.kind === 'action' && (
        <>
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-hover/80 text-ink-dim [&>svg]:size-3.5">
            {item.icon}
          </span>
          <span className="flex-1 text-[13.5px] font-medium text-ink">{item.label}</span>
        </>
      )}
    </button>
  );
}

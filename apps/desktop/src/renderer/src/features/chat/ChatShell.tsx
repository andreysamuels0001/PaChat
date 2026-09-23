import { useCallback, useEffect } from 'react';
import { MessagesSquare } from 'lucide-react';
import { cn } from '@/lib/cn';
import { bridge } from '@/lib/bridge';
import { useHotkey } from '@/lib/hooks';
import { EmptyState } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { selectActiveConversation, selectOrderedConversations, useChat } from '@/store/chat-store';
import { useUi } from '@/store/ui-store';
import { markEverythingRead, openConversation } from '@/store/realtime';
import type { MenuCommand } from '../../../../shared-ipc/contract';
import { Sidebar } from './Sidebar';
import { ConversationHeader } from './ConversationHeader';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { MemberPanel } from './MemberPanel';
import { CommandPalette } from './CommandPalette';
import { NewChannelDialog, NewDirectDialog } from './NewConversationDialogs';
import { SettingsDialog } from '../settings/SettingsDialog';

/**
 * The signed-in application layout.
 *
 * A three-column grid — navigation, conversation, members — with the member
 * panel collapsible. Keyboard shortcuts and native-menu commands are bound
 * here, at the single point where the whole surface is in scope.
 */
export function ChatShell() {
  const conversation = useChat(selectActiveConversation);
  const conversations = useChat(selectOrderedConversations);
  const showMembers = useUi((s) => s.showMembers);
  const openOverlay = useUi((s) => s.openOverlay);
  const closeOverlay = useUi((s) => s.closeOverlay);
  const toggleMembers = useUi((s) => s.toggleMembers);
  const overlay = useUi((s) => s.overlay);

  /* ── Keyboard ──────────────────────────────────────────────────────────── */

  useHotkey('mod+k', () => openOverlay('palette'), { allowInInput: true });
  useHotkey('mod+shift+n', () => openOverlay('new-channel'));
  useHotkey('mod+,', () => openOverlay('settings'));
  useHotkey('mod+shift+m', () => toggleMembers());
  useHotkey('mod+shift+e', () => void markEverythingRead());

  // Escape closes whatever is open, from anywhere including a focused field.
  useHotkey('escape', () => overlay !== 'none' && closeOverlay(), { allowInInput: true });

  /**
   * Moves the selection through the sidebar order, wrapping at both ends.
   * Memoised because the menu-command effect depends on it.
   */
  const step = useCallback(
    (delta: number): void => {
      if (conversations.length === 0) return;
      const index = conversations.findIndex((c) => c.id === conversation?.id);
      const next = (index + delta + conversations.length) % conversations.length;
      void openConversation(conversations[next]!.id);
    },
    [conversations, conversation?.id],
  );

  useHotkey('mod+alt+arrowdown', () => step(1));
  useHotkey('mod+alt+arrowup', () => step(-1));

  /* ── Native menu and notification routing ──────────────────────────────── */

  useEffect(() => {
    const offMenu = bridge.app.onMenuCommand((command: MenuCommand) => {
      switch (command) {
        case 'open-command-palette':
          openOverlay('palette');
          break;
        case 'open-settings':
          openOverlay('settings');
          break;
        case 'new-channel':
          openOverlay('new-channel');
          break;
        case 'toggle-members':
          toggleMembers();
          break;
        case 'mark-all-read':
          void markEverythingRead();
          break;
        case 'next-conversation':
          step(1);
          break;
        case 'previous-conversation':
          step(-1);
          break;
        case 'focus-composer':
          document.querySelector<HTMLTextAreaElement>('textarea')?.focus();
          break;
      }
    });

    // Clicking a desktop notification jumps straight to that conversation.
    const offNotify = bridge.notifications.onActivated((conversationId) => {
      void openConversation(conversationId);
    });

    return () => {
      offMenu();
      offNotify();
    };
  }, [openOverlay, toggleMembers, step]);

  return (
    <div className="flex min-h-0 flex-1">
      <Sidebar />

      <main className="flex min-w-0 flex-1 flex-col bg-base">
        {conversation ? (
          <>
            <ConversationHeader conversation={conversation} />
            <MessageList conversation={conversation} />
            <Composer conversation={conversation} />
          </>
        ) : (
          <EmptyState
            icon={<MessagesSquare />}
            title="Nothing open"
            description="Pick a conversation from the sidebar, or start a new one."
            action={
              <Button variant="primary" onClick={() => openOverlay('new-channel')}>
                Create a channel
              </Button>
            }
          />
        )}
      </main>

      {/* The member panel is hidden rather than unmounted on narrow windows so
          toggling it back does not re-fetch or re-animate. */}
      <div className={cn('hidden xl:block', !showMembers && 'xl:hidden')}>
        {conversation && <MemberPanel conversation={conversation} />}
      </div>

      <CommandPalette />
      <NewChannelDialog />
      <NewDirectDialog />
      <SettingsDialog />
    </div>
  );
}

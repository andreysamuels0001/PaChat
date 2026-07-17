import { Copy, Minus, Search, Square, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { bridge, isDesktop } from '@/lib/bridge';
import { Kbd, shortcut, Tooltip } from '@/components/ui/Controls';
import { Logo } from '@/components/brand/Logo';
import { useUi } from '@/store/ui-store';
import { useChat, selectActiveConversation } from '@/store/chat-store';
import { titleOf } from '@/store/realtime';

/**
 * The window frame, drawn in React.
 *
 * Electron's native frame is removed so the titlebar can carry product chrome
 * — the current conversation and the search entry point — instead of wasting
 * 32 vertical pixels on an empty strip. The `drag-region` utility is what
 * still lets the window be moved; interactive children opt out with `no-drag`.
 *
 * macOS keeps its native traffic lights (hidden titlebar style), so the custom
 * buttons are rendered only on Windows and Linux and the left padding is
 * widened to clear them.
 */
export function TitleBar() {
  const platform = bridge.info.platform;
  const isMac = platform === 'darwin';
  const maximised = useUi((s) => s.windowMaximised);
  const openOverlay = useUi((s) => s.openOverlay);
  const conversation = useChat(selectActiveConversation);

  return (
    <header
      className={cn(
        'drag-region relative z-20 flex h-(--titlebar-height) shrink-0 items-center gap-3',
        'bg-base px-3 hairline-b',
        isMac && 'pl-20',
      )}
    >
      <div className="flex items-center gap-2.5">
        <Logo size={18} />
        {!conversation && (
          <span className="text-[13px] font-semibold tracking-tight text-ink">PaChat</span>
        )}
      </div>

      {conversation && (
        <div className="flex min-w-0 items-center gap-1.5 text-[12.5px]">
          <span className="text-ink-faint">/</span>
          <span className="truncate font-medium text-ink-muted">
            {conversation.kind === 'channel' ? `#${conversation.name}` : titleOf(conversation)}
          </span>
        </div>
      )}

      {/* Centre search affordance. Sized rather than stretched so the drag
          region either side of it stays generous enough to grab. */}
      <button
        type="button"
        onClick={() => openOverlay('palette')}
        className={cn(
          'no-drag mx-auto flex h-7 w-72 items-center gap-2 rounded-md border border-line',
          'bg-sunken/70 px-2.5 text-[12.5px] text-ink-faint transition-colors',
          'duration-(--duration-fast) hover:border-line-strong hover:bg-sunken hover:text-ink-dim',
        )}
      >
        <Search className="size-3.5 shrink-0" aria-hidden />
        <span className="flex-1 text-left">Search messages and channels</span>
        <Kbd>{shortcut('Mod')}</Kbd>
        <Kbd>K</Kbd>
      </button>

      {!isMac && isDesktop && (
        <div className="flex items-center gap-0.5">
          <WindowButton label="Minimise" onClick={() => bridge.window.minimise()}>
            <Minus className="size-3.5" />
          </WindowButton>
          <WindowButton
            label={maximised ? 'Restore' : 'Maximise'}
            onClick={() => bridge.window.toggleMaximise()}
          >
            {maximised ? <Copy className="size-3" /> : <Square className="size-3" />}
          </WindowButton>
          <WindowButton label="Close" danger onClick={() => bridge.window.close()}>
            <X className="size-3.5" />
          </WindowButton>
        </div>
      )}

      {/* On macOS the right side is empty, so give the drag region a target. */}
      {isMac && <div className="w-2" />}
    </header>
  );
}

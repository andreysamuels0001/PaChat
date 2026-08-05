import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * A keyboard shortcut bound to the document.
 *
 * Matching is done against `event.key` plus the modifier flags rather than
 * `event.code`, so the binding follows the user's keyboard layout. `Mod` maps
 * to Cmd on macOS and Ctrl elsewhere.
 */
export function useHotkey(
  combo: string,
  handler: (event: KeyboardEvent) => void,
  options: { enabled?: boolean; allowInInput?: boolean } = {},
): void {
  const { enabled = true, allowInInput = false } = options;
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    if (!enabled) return;

    const parts = combo.toLowerCase().split('+');
    const key = parts[parts.length - 1]!;
    const wantsMod = parts.includes('mod');
    const wantsShift = parts.includes('shift');
    const wantsAlt = parts.includes('alt');

    const onKeyDown = (event: KeyboardEvent): void => {
      const isMac = navigator.platform.toLowerCase().includes('mac');
      const mod = isMac ? event.metaKey : event.ctrlKey;

      if (event.key.toLowerCase() !== key) return;
      if (wantsMod !== mod) return;
      if (wantsShift !== event.shiftKey) return;
      if (wantsAlt !== event.altKey) return;

      // Typing in a field must not trigger navigation shortcuts, unless the
      // binding explicitly opts in (Escape, for instance).
      if (!allowInInput) {
        const target = event.target as HTMLElement | null;
        const tag = target?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      }

      latest.current(event);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [combo, enabled, allowInInput]);
}

/**
 * Keeps a scroll container pinned to the bottom as content arrives, but only
 * while the user is already near the bottom.
 *
 * This is the behaviour that makes a chat log usable: a new message must not
 * yank someone out of history they are reading, and must not leave them
 * stranded one message behind when they are following the conversation live.
 */
export function useStickyScroll<T extends HTMLElement>(dependency: unknown) {
  const ref = useRef<T>(null);
  const [atBottom, setAtBottom] = useState(true);
  const pinned = useRef(true);

  const THRESHOLD = 120;

  const onScroll = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    pinned.current = distance < THRESHOLD;
    setAtBottom(pinned.current);
  }, []);

  // Layout effect, not effect: the scroll must be corrected in the same frame
  // the new content is painted, or the list visibly jumps.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !pinned.current) return;
    element.scrollTop = element.scrollHeight;
  }, [dependency]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const element = ref.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior });
    pinned.current = true;
    setAtBottom(true);
  }, []);

  return { ref, atBottom, onScroll, scrollToBottom };
}

/**
 * Fires when a sentinel element scrolls into view — used to page older history
 * as the user reaches the top of the log.
 */
export function useOnReachTop(
  containerRef: React.RefObject<HTMLElement | null>,
  onReach: () => void,
  options: { enabled?: boolean; offset?: number } = {},
): void {
  const { enabled = true, offset = 240 } = options;
  const latest = useRef(onReach);
  latest.current = onReach;

  useEffect(() => {
    const element = containerRef.current;
    if (!element || !enabled) return;

    let busy = false;

    const onScroll = (): void => {
      if (busy || element.scrollTop > offset) return;
      busy = true;
      latest.current();
      // Debounce: without it a slow page request fires once per scroll event
      // for as long as the sentinel stays in view.
      window.setTimeout(() => {
        busy = false;
      }, 400);
    };

    element.addEventListener('scroll', onScroll, { passive: true });
    return () => element.removeEventListener('scroll', onScroll);
  }, [containerRef, enabled, offset]);
}

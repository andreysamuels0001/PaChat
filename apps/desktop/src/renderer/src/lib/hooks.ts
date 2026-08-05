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

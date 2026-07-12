import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/* ──────────────────────────────────────────────────────────────── Switch ───*/

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'no-drag relative h-[22px] w-[38px] shrink-0 rounded-full border transition-colors',
        'duration-(--duration-base) ease-(--ease-smooth) disabled:opacity-40',
        checked
          ? 'border-accent-500/50 bg-accent-500'
          : 'border-line-strong bg-hover hover:bg-active',
      )}
    >
      <span
        className={cn(
          'absolute top-[2px] size-4 rounded-full bg-white shadow-elevation-sm',
          'transition-[left] duration-(--duration-base) ease-(--ease-smooth)',
          checked ? 'left-[18px]' : 'left-[2px]',
        )}
      />
    </button>
  );
}

/* ─────────────────────────────────────────────────────────── Segmented ────*/

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

/**
 * A compact exclusive choice. Used instead of a select for small option sets,
 * because seeing every option at once is faster than opening a menu and the
 * states are discoverable without a click.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
}: {
  options: Array<SegmentedOption<T>>;
  value: T;
  onChange: (next: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      role="radiogroup"
      className={cn(
        'no-drag inline-flex items-center gap-0.5 rounded-md border border-line bg-sunken/60 p-0.5',
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-sm font-medium',
              'transition-colors duration-(--duration-fast) ease-(--ease-smooth)',
              size === 'sm' ? 'h-6 px-2 text-[11.5px]' : 'h-7 px-2.5 text-[12.5px]',
              selected
                ? 'bg-raised text-ink shadow-elevation-sm'
                : 'text-ink-dim hover:text-ink-muted',
            )}
          >
            {option.icon && <span className="[&>svg]:size-3.5">{option.icon}</span>}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── Tooltip ───*/

type Placement = 'top' | 'bottom' | 'left' | 'right';

const PLACEMENT: Record<Placement, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
  left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
  right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
};

/**
 * A CSS-only tooltip with a short open delay.
 *
 * No portal and no positioning library: everything it labels in this app sits
 * well inside the window, so absolute placement relative to the trigger is
 * both sufficient and free of layout thrash. The delay stops tooltips flashing
 * as the pointer crosses a toolbar.
 */
export function Tooltip({
  content,
  placement = 'top',
  shortcut,
  children,
}: {
  content: string;
  placement?: Placement;
  shortcut?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [timer, setTimer] = useState<number | null>(null);

  const show = (): void => {
    const handle = window.setTimeout(() => setOpen(true), 380);
    setTimer(handle);
  };

  const hide = (): void => {
    if (timer) window.clearTimeout(timer);
    setTimer(null);
    setOpen(false);
  };

  return (
    <span
      className="relative inline-flex"
      onPointerEnter={show}
      onPointerLeave={hide}
      onPointerDown={hide}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className={cn(
            'pointer-events-none absolute z-50 flex items-center gap-1.5 whitespace-nowrap',
            'rounded-sm border border-line bg-overlay px-2 py-1 text-[11.5px] font-medium',
            'text-ink shadow-elevation-md',
            PLACEMENT[placement],
          )}
        >
          {content}
          {shortcut && <Kbd>{shortcut}</Kbd>}
        </span>
      )}
    </span>
  );
}

/** Keyboard shortcut chip. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-xs',
        'border border-line-strong bg-sunken px-1 font-sans text-[10.5px] font-semibold',
        'text-ink-dim',
      )}
    >
      {children}
    </kbd>
  );
}

/** Formats a shortcut for the host platform — ⌘ on macOS, Ctrl elsewhere. */
export function shortcut(keys: string): string {
  const isMac = navigator.platform.toLowerCase().includes('mac');
  return keys.replace(/Mod/g, isMac ? '⌘' : 'Ctrl').replace(/Alt/g, isMac ? '⌥' : 'Alt');
}

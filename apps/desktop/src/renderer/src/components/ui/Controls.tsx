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

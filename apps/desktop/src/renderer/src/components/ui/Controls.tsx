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

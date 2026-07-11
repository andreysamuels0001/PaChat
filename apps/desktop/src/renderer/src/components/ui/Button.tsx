import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'accent-gradient text-white shadow-elevation-sm hover:brightness-110 active:brightness-95 ' +
    'disabled:opacity-50',
  secondary:
    'bg-raised text-ink border border-line hover:bg-hover active:bg-active ' +
    'disabled:opacity-50',
  ghost: 'text-ink-muted hover:bg-hover hover:text-ink active:bg-active disabled:opacity-40',
  subtle:
    'bg-hover/60 text-ink-muted hover:bg-hover hover:text-ink active:bg-active disabled:opacity-40',
  danger:
    'bg-danger/12 text-danger border border-danger/25 hover:bg-danger/20 active:bg-danger/25 ' +
    'disabled:opacity-50',
};

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-[12.5px] gap-1.5 rounded-sm',
  md: 'h-9 px-3.5 text-[13.5px] gap-2 rounded-md',
  lg: 'h-11 px-5 text-[14.5px] gap-2 rounded-md',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Replaces the content with a spinner and blocks interaction. */
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    icon,
    iconRight,
    fullWidth,
    className,
    children,
    disabled,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      // A loading button stays mounted and sized but refuses input, so the
      // layout does not jump and a double-submit is impossible.
      disabled={disabled || loading}
      className={cn(
        'no-drag relative inline-flex select-none items-center justify-center font-medium',
        'transition-[background-color,color,filter,box-shadow] duration-(--duration-fast)',
        'ease-(--ease-smooth) disabled:cursor-not-allowed',
        SIZES[size],
        VARIANTS[variant],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        icon && <span className="shrink-0 [&>svg]:size-4">{icon}</span>
      )}
      {children && <span className="truncate">{children}</span>}
      {!loading && iconRight && <span className="shrink-0 [&>svg]:size-4">{iconRight}</span>}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: an icon-only control needs an accessible name. */
  label: string;
  variant?: Variant;
  size?: 'xs' | 'sm' | 'md';
  active?: boolean;
}

const ICON_SIZES = {
  xs: 'size-6 rounded-sm [&>svg]:size-3.5',
  sm: 'size-7 rounded-sm [&>svg]:size-4',
  md: 'size-9 rounded-md [&>svg]:size-[18px]',
} as const;

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = 'ghost', size = 'sm', active, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        'no-drag inline-flex shrink-0 items-center justify-center',
        'transition-[background-color,color] duration-(--duration-fast) ease-(--ease-smooth)',
        'disabled:cursor-not-allowed disabled:opacity-40',
        ICON_SIZES[size],
        VARIANTS[variant],
        active && 'bg-accent-500/15 text-accent-300 hover:bg-accent-500/20',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

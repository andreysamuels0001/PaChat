import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Form field primitives.
 *
 * The label, hint and error are rendered by the field itself and wired with
 * `aria-describedby`/`aria-invalid`, so a screen reader announces the failure
 * with the input rather than as a detached line of text elsewhere on screen.
 */

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  hint?: string;
  error?: string;
  icon?: ReactNode;
  trailing?: ReactNode;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, icon, trailing, className, id, ...rest },
  ref,
) {
  const generated = useId();
  const fieldId = id ?? generated;
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={fieldId}
          className="text-[12px] font-medium tracking-wide text-ink-muted select-none"
        >
          {label}
        </label>
      )}

      <div
        className={cn(
          'group relative flex items-center gap-2 rounded-md border bg-sunken/60 px-3',
          'transition-[border-color,box-shadow] duration-(--duration-fast) ease-(--ease-smooth)',
          'focus-within:border-accent-500/60 focus-within:bg-sunken',
          'focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--c-accent-500)_18%,transparent)]',
          error ? 'border-danger/60' : 'border-line',
        )}
      >
        {icon && (
          <span className="shrink-0 text-ink-dim [&>svg]:size-4" aria-hidden>
            {icon}
          </span>
        )}

        <input
          ref={ref}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'h-10 min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none',
            'placeholder:text-ink-faint selectable',
            className,
          )}
          {...rest}
        />

        {trailing && <span className="shrink-0">{trailing}</span>}
      </div>

      {error ? (
        <p
          id={`${fieldId}-error`}
          role="alert"
          className="flex items-center gap-1.5 text-[12px] text-danger"
        >
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${fieldId}-hint`} className="text-[12px] text-ink-faint">
            {hint}
          </p>
        )
      )}
    </div>
  );
});

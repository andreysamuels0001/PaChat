import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useUi, type Toast } from '@/store/ui-store';

/* ────────────────────────────────────────────────────────────── Spinner ───*/

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin text-ink-dim', className)} aria-hidden />;
}

/* ──────────────────────────────────────────────────────────── Skeleton ────*/

/**
 * Loading placeholder for message history.
 *
 * Varies the bubble widths pseudo-randomly from the index so the skeleton
 * reads as text rather than as a stack of identical bars — a uniform skeleton
 * is more noticeable than the content it stands in for.
 */
export function MessageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-5 px-6 py-6" aria-hidden>
      {Array.from({ length: rows }, (_, index) => {
        const width = 42 + ((index * 37) % 48);
        return (
          <div key={index} className="flex gap-3">
            <div className="skeleton size-8 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
              <div className="skeleton h-2.5 w-24 rounded-full" />
              <div className="skeleton h-3 rounded-full" style={{ width: `${width}%` }} />
              {index % 3 === 0 && (
                <div className="skeleton h-3 rounded-full" style={{ width: `${width - 18}%` }} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ────────────────────────────────────────────────────────── EmptyState ────*/

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
      {icon && (
        <div
          className={cn(
            'flex size-14 items-center justify-center rounded-2xl',
            'border border-line-subtle bg-raised text-ink-dim [&>svg]:size-6',
          )}
        >
          {icon}
        </div>
      )}
      <div className="max-w-sm">
        <h3 className="text-[14.5px] font-semibold tracking-tight text-ink">{title}</h3>
        {description && (
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-dim">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── Toasts ────*/

const TONE_ICON: Record<Toast['tone'], ReactNode> = {
  info: <Info />,
  success: <CheckCircle2 />,
  warning: <AlertTriangle />,
  danger: <XCircle />,
};

const TONE_CLASS: Record<Toast['tone'], string> = {
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

/**
 * Transient notices, stacked bottom-right.
 *
 * `aria-live="polite"` rather than `assertive`: a toast never blocks progress,
 * so interrupting whatever a screen reader is currently saying would be worse
 * than waiting for a pause.
 */
export function Toaster() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismissToast);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed right-4 bottom-4 z-200 flex w-80 flex-col gap-2"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, x: 24, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 16, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-lg border border-line',
              'glass px-3.5 py-3 shadow-elevation-lg',
            )}
          >
            <span className={cn('mt-px shrink-0 [&>svg]:size-4', TONE_CLASS[toast.tone])}>
              {TONE_ICON[toast.tone]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-ink">{toast.title}</p>
              {toast.description && (
                <p className="mt-0.5 text-[12px] leading-relaxed text-ink-dim break-words">
                  {toast.description}
                </p>
              )}
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(toast.id)}
              className="shrink-0 rounded-xs p-0.5 text-ink-faint hover:bg-hover hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

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

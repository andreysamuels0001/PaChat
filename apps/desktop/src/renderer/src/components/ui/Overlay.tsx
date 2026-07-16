import { useEffect, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { IconButton } from './Button';

/**
 * Modal surface.
 *
 * Handles the three things every dialog needs and most hand-rolled ones miss:
 * Escape closes it, focus moves inside on open and returns to the trigger on
 * close, and a click on the scrim dismisses while a click inside does not.
 */

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  /** Tailwind max-width class; dialogs are sized by content, not by preset. */
  width?: string;
  /** Hides the chrome entirely — used by the command palette. */
  bare?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  width = 'max-w-lg',
  bare = false,
  children,
  footer,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    restoreFocusTo.current = document.activeElement as HTMLElement | null;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }

      // Trap Tab inside the panel so focus cannot wander onto the chat behind
      // the scrim, which would be invisible and unreachable by mouse.
      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);

    // Defer one frame so the element exists and the entry animation has begun.
    const handle = requestAnimationFrame(() => {
      const target = panelRef.current?.querySelector<HTMLElement>(
        '[data-autofocus], input, textarea, button',
      );
      target?.focus();
    });

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      cancelAnimationFrame(handle);
      restoreFocusTo.current?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-100 flex items-start justify-center pt-[12vh]">
          <motion.div
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            onClick={onClose}
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={cn(
              'no-drag relative w-full overflow-hidden rounded-xl border border-line',
              'glass shadow-elevation-lg',
              width,
            )}
            initial={{ opacity: 0, y: 8, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.99 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            {!bare && (title || description) && (
              <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-3 hairline-b">
                <div className="min-w-0">
                  {title && (
                    <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
                  )}
                  {description && (
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-dim">
                      {description}
                    </p>
                  )}
                </div>
                <IconButton label="Close" onClick={onClose}>
                  <X />
                </IconButton>
              </header>
            )}

            <div className={cn(!bare && 'px-5 py-4')}>{children}</div>

            {footer && (
              <footer className="flex items-center justify-end gap-2 px-5 py-3.5 hairline-t">
                {footer}
              </footer>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/**
 * A contextual popover anchored to its trigger. Closes on an outside click or
 * Escape — the two gestures users try first.
 */
export function Popover({
  open,
  onClose,
  align = 'end',
  side = 'top',
  children,
}: {
  open: boolean;
  onClose: () => void;
  align?: 'start' | 'end' | 'center';
  side?: 'top' | 'bottom';
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent): void => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };

    // Capture phase so the popover closes before the click reaches whatever is
    // underneath it, preventing a close-and-immediately-reopen flicker.
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          className={cn(
            'absolute z-50 overflow-hidden rounded-lg border border-line glass',
            'shadow-elevation-lg',
            side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
            align === 'end'
              ? 'right-0'
              : align === 'start'
                ? 'left-0'
                : 'left-1/2 -translate-x-1/2',
          )}
          initial={{ opacity: 0, y: side === 'top' ? 4 : -4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: side === 'top' ? 2 : -2, scale: 0.99 }}
          transition={{ duration: 0.13, ease: [0.22, 1, 0.36, 1] }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

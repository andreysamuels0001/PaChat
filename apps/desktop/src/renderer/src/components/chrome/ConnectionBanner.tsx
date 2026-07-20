import { AnimatePresence, motion } from 'framer-motion';
import { CloudOff, Loader2, RefreshCw, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { ConnectionStatus } from '@/lib/socket';
import { useSession } from '@/store/session-store';

/**
 * Connection state, shown only when it is not "connected".
 *
 * A persistent green "online" indicator trains users to ignore the strip
 * entirely — which is exactly when it needs to be noticed. So the banner
 * collapses to nothing on the happy path and animates in the moment the
 * socket is in any other state.
 */

interface Appearance {
  icon: React.ReactNode;
  message: string;
  className: string;
  spin?: boolean;
}

const APPEARANCE: Partial<Record<ConnectionStatus, Appearance>> = {
  connecting: {
    icon: <Loader2 />,
    message: 'Connecting to PaChat…',
    className: 'bg-accent-500/12 text-accent-300 border-accent-500/20',
    spin: true,
  },
  reconnecting: {
    icon: <RefreshCw />,
    message: 'Connection lost — reconnecting…',
    className: 'bg-warning/12 text-warning border-warning/20',
    spin: true,
  },
  offline: {
    icon: <CloudOff />,
    message: 'Cannot reach the PaChat server. Check that it is running.',
    className: 'bg-danger/12 text-danger border-danger/20',
  },
  incompatible: {
    icon: <TriangleAlert />,
    message: 'This server requires a newer version of PaChat.',
    className: 'bg-danger/12 text-danger border-danger/20',
  },
};

export function ConnectionBanner() {
  const status = useSession((s) => s.connection);
  const appearance = APPEARANCE[status];

  return (
    <AnimatePresence initial={false}>
      {appearance && (
        <motion.div
          key={status}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 30, opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="shrink-0 overflow-hidden"
          role="status"
        >
          <div
            className={cn(
              'flex h-[30px] items-center justify-center gap-2 border-b',
              'text-[12px] font-medium',
              appearance.className,
            )}
          >
            <span className={cn('[&>svg]:size-3.5', appearance.spin && '[&>svg]:animate-spin')}>
              {appearance.icon}
            </span>
            {appearance.message}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

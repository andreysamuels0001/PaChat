import { cn } from '@/lib/cn';

/**
 * The PaChat mark: a speech bubble carrying a live signal trace.
 *
 * The bubble says "conversation"; the trace running through it says that the
 * conversation is happening *now* rather than being fetched on a refresh —
 * which is the whole claim the product makes.
 *
 * Drawn as inline SVG rather than loaded as an asset so it inherits
 * `currentColor`, scales without a second file, and is available before any
 * network or disk read completes.
 */
export function Logo({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="PaChat"
      className={cn('shrink-0', className)}
    >
      <defs>
        <linearGradient
          id="pachat-mark"
          x1="4"
          y1="3"
          x2="28"
          y2="29"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#818CF8" />
          <stop offset="0.55" stopColor="#6366F1" />
          <stop offset="1" stopColor="#A855F7" />
        </linearGradient>
      </defs>

      {/* Bubble */}
      <path
        d="M16 3.5c7.18 0 12.5 4.6 12.5 10.7 0 6.1-5.32 10.7-12.5 10.7-1.33 0-2.62-.13-3.84-.38l-5.1 3.1a.9.9 0 0 1-1.36-.86l.4-4.52C3.6 20.3 3.5 17.3 3.5 14.2 3.5 8.1 8.82 3.5 16 3.5Z"
        fill="url(#pachat-mark)"
      />

      {/* Live signal trace */}
      <path
        d="M8.6 14.6h3.1l1.9-4.3 3.2 8.2 2.1-3.9h3.5"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.95"
      />
    </svg>
  );
}

/** Mark plus wordmark, used on the auth screen and in the sidebar header. */
export function Wordmark({
  className,
  size = 'md',
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const metrics = {
    sm: { logo: 20, text: 'text-[14px]' },
    md: { logo: 26, text: 'text-[17px]' },
    lg: { logo: 38, text: 'text-[26px]' },
  }[size];

  return (
    <div className={cn('flex items-center gap-2.5 select-none', className)}>
      <Logo size={metrics.logo} />
      <span
        className={cn(
          'font-semibold tracking-[-0.02em] text-ink',
          // The negative tracking matters more than usual here: Inter sets the
          // capital pair "PaC" loose by default, which reads as three words
          // rather than one at sidebar size.
          metrics.text,
        )}
      >
        PaChat
      </span>
    </div>
  );
}

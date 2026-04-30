import { env } from '../config/env.js';

/**
 * A dependency-free structured logger.
 *
 * In development it prints aligned, coloured lines that stay readable beside
 * the Vite output; in production it emits one JSON object per line so any log
 * shipper can ingest it without a parser.
 */

const LEVELS = { trace: 10, debug: 20, info: 30, warn: 40, error: 50 } as const;
type Level = keyof typeof LEVELS;

const threshold = LEVELS[env.LOG_LEVEL];

const PAINT: Record<Level, string> = {
  trace: '\x1b[90m',
  debug: '\x1b[36m',
  info: '\x1b[35m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

type Fields = Record<string, unknown>;

function serialiseError(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

function emit(level: Level, scope: string, message: string, fields?: Fields): void {
  if (LEVELS[level] < threshold) return;

  const payload: Fields = { ...fields };
  if (payload.err) payload.err = serialiseError(payload.err);

  if (env.isProduction) {
    process.stdout.write(
      `${JSON.stringify({ time: new Date().toISOString(), level, scope, message, ...payload })}\n`,
    );
    return;
  }

  const stamp = new Date().toISOString().slice(11, 23);
  const tag = level.toUpperCase().padEnd(5);
  const extras = Object.entries(payload)
    .map(([key, value]) => {
      const rendered =
        typeof value === 'string'
          ? value
          : value instanceof Error
            ? value.message
            : JSON.stringify(value);
      return `${DIM}${key}${RESET}=${rendered}`;
    })
    .join(' ');

  const line =
    `${DIM}${stamp}${RESET} ${PAINT[level]}${tag}${RESET} ` +
    `${DIM}${scope.padEnd(12)}${RESET} ${message}${extras ? ` ${extras}` : ''}`;

  process.stdout.write(`${line}\n`);

  if (payload.err instanceof Error && payload.err.stack) {
    process.stdout.write(`${DIM}${payload.err.stack}${RESET}\n`);
  }
}

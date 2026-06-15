import { createServer } from 'node:http';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { API_PREFIX, PROTOCOL_VERSION, SOCKET_NAMESPACE } from '@pachat/shared';
import { env } from './config/env.js';
import { closeDb, getDb } from './db/index.js';
import { runMigrations } from './db/migrate.js';
import { createApp } from './http/app.js';
import { createGateway } from './realtime/gateway.js';
import { createLogger } from './lib/logger.js';
import { pruneOrphanAttachments } from './repositories/messages.js';
import { pruneSessions } from './repositories/sessions.js';
import { resetAllPresence } from './repositories/users.js';
import * as presence from './services/presence-service.js';
import * as typing from './services/typing-service.js';

const log = createLogger('server');

/**
 * Boot sequence, in the order the steps actually depend on each other:
 * open the database, bring the schema current, sweep state that cannot have
 * survived the last shutdown, then start accepting traffic.
 */
async function main(): Promise<void> {
  getDb();

  const migration = runMigrations();
  if (migration.applied.length > 0) {
    log.info('schema migrated', { to: migration.to, applied: migration.applied });
  }

  housekeeping();

  const app = createApp();
  const httpServer = createServer(app);
  const io = createGateway(httpServer);

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(env.PORT, env.HOST, resolve);
  });

  banner();
  scheduleHousekeeping();
  installShutdownHooks(httpServer, io);
}

/**
 * Presence is derived from live sockets, so every record claiming to be online
 * after a restart is a lie. Clear it before the first client can read it.
 * Expired sessions and never-attached uploads are swept at the same time.
 */
function housekeeping(): void {
  resetAllPresence();

  const sessionsPruned = pruneSessions();
  if (sessionsPruned > 0) log.debug('expired sessions pruned', { count: sessionsPruned });

  const orphans = pruneOrphanAttachments();
  for (const row of orphans) {
    rmSync(join(env.uploadDir, row.storage_key), { recursive: true, force: true });
  }
  if (orphans.length > 0) log.debug('orphaned uploads removed', { count: orphans.length });
}

/** Repeats the sweep daily so a long-lived process does not accumulate cruft. */
function scheduleHousekeeping(): void {
  const timer = setInterval(
    () => {
      try {
        housekeeping();
      } catch (error) {
        log.error('housekeeping failed', { err: error });
      }
    },
    24 * 60 * 60 * 1000,
  );
  timer.unref();
}

function banner(): void {
  const origin = `http://${env.HOST}:${env.PORT}`;

  const WIDTH = 52;
  const EDGE = '\x1b[35m│\x1b[0m';
  const rule = '─'.repeat(WIDTH);

  /**
   * Pads from the *visible* text length rather than a hard-coded count, so the
   * box stays square if the product name or environment label ever changes.
   * Styling is applied around the text, never inside the measurement.
   */
  const row = (text: string, style: string): string =>
    `${EDGE}  ${style}${text}\x1b[0m${' '.repeat(Math.max(0, WIDTH - 2 - text.length))}${EDGE}\n`;

  process.stdout.write(
    `\n\x1b[35m┌${rule}┐\x1b[0m\n` +
      row('PaChat realtime gateway', '\x1b[1m') +
      row(`protocol v${PROTOCOL_VERSION} · ${env.NODE_ENV}`, '\x1b[2m') +
      `\x1b[35m└${rule}┘\x1b[0m\n\n` +
      `  REST      ${origin}${API_PREFIX}\n` +
      `  WebSocket ${origin}${SOCKET_NAMESPACE}\n` +
      `  Health    ${origin}${API_PREFIX}/health\n\n`,
  );
}

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

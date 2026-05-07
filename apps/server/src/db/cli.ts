#!/usr/bin/env node
/**
 * Database maintenance entry point.
 *
 *   npm run db:migrate   apply pending migrations
 *   npm run db:seed      populate the demo workspace (no-op if users exist)
 *   npm run db:reset     delete the database file, then migrate + seed
 */
import { rmSync } from 'node:fs';
import { env } from '../config/env.js';
import { closeDb, getDb } from './index.js';
import { runMigrations, schemaVersion } from './migrate.js';
import { seedDatabase } from './seed.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('db:cli');
const command = process.argv[2];

async function main(): Promise<void> {
  switch (command) {
    case 'migrate': {
      const result = runMigrations();
      if (result.applied.length === 0) {
        log.info('schema already current', { version: result.to });
      } else {
        log.info('schema migrated', { from: result.from, to: result.to, applied: result.applied });
      }
      break;
    }

    case 'seed': {
      runMigrations();
      await seedDatabase();
      break;
    }

    case 'reset': {
      closeDb();
      // WAL mode leaves sidecar files; all three must go or the "fresh"
      // database resurrects pages from the old write-ahead log.
      for (const suffix of ['', '-wal', '-shm']) {
        rmSync(`${env.databasePath}${suffix}`, { force: true });
      }
      rmSync(env.uploadDir, { recursive: true, force: true });
      log.warn('database and uploads deleted', { path: env.databasePath });
      runMigrations();
      await seedDatabase();
      break;
    }

    case 'status': {
      getDb();
      log.info('schema version', { version: schemaVersion(), path: env.databasePath });
      break;
    }

    default:
      console.error(
        `\nUsage: tsx src/db/cli.ts <migrate|seed|reset|status>\n` +
          `  migrate  apply pending migrations\n` +
          `  seed     insert the demo workspace\n` +
          `  reset    drop everything, then migrate and seed\n` +
          `  status   print the current schema version\n`,
      );
      process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    log.error('command failed', { err: error });
    process.exitCode = 1;
  })
  .finally(() => closeDb());

import { mkdirSync } from 'node:fs';
import Database from 'better-sqlite3';
import { env } from '../config/env.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('db');

export type Db = Database.Database;

let instance: Db | null = null;

/**
 * Opens (once) the embedded SQLite database.
 *
 * SQLite is a deliberate choice rather than a shortcut: PaChat is a
 * single-node, self-hosted service, and an in-process store removes an entire
 * tier of deployment, connection pooling and network latency. The pragmas
 * below are what turn the default configuration into one suitable for a
 * concurrent realtime workload.
 */
export function getDb(): Db {
  if (instance) return instance;

  mkdirSync(env.dataDir, { recursive: true });
  mkdirSync(env.uploadDir, { recursive: true });

  const db = new Database(env.databasePath);

  // Write-ahead logging lets readers proceed during a write — essential when
  // every inbound message writes while the UI is paging history.
  db.pragma('journal_mode = WAL');
  // `normal` fsyncs at checkpoints rather than per transaction: a crash can
  // lose the last few milliseconds, never the database. The right trade for
  // chat traffic.
  db.pragma('synchronous = NORMAL');
  // Referential integrity is off by default in SQLite. PaChat relies on
  // ON DELETE CASCADE to clean up members, reactions and attachments.
  db.pragma('foreign_keys = ON');
  // Wait instead of immediately throwing SQLITE_BUSY under contention.
  db.pragma('busy_timeout = 5000');
  // 64 MiB page cache and memory-backed temp tables keep history queries and
  // FTS ranking off the disk.
  db.pragma('cache_size = -64000');
  db.pragma('temp_store = MEMORY');

  instance = db;
  log.debug('database opened', { path: env.databasePath });
  return db;
}

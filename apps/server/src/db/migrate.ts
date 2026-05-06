import { getDb } from './index.js';
import { LATEST_VERSION, MIGRATIONS } from './migrations.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('migrate');

/**
 * Applies every migration newer than the recorded schema version.
 *
 * Each migration runs inside its own transaction together with the bookkeeping
 * insert, so a failure halfway through leaves the database at the last fully
 * applied version rather than in a half-migrated state.
 */
export function runMigrations(): { from: number; to: number; applied: string[] } {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT    NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  const current =
    (
      db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as {
        version: number | null;
      }
    ).version ?? 0;

  if (current > LATEST_VERSION) {
    throw new Error(
      `Database schema is at version ${current} but this build only knows ${LATEST_VERSION}. ` +
        'Upgrade the server before starting it against this database.',
    );
  }

  const pending = MIGRATIONS.filter((m) => m.version > current).sort(
    (a, b) => a.version - b.version,
  );

  if (pending.length === 0) {
    log.debug('schema up to date', { version: current });
    return { from: current, to: current, applied: [] };
  }

  const record = db.prepare(
    'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
  );

  const applied: string[] = [];
  for (const migration of pending) {
    const apply = db.transaction(() => {
      db.exec(migration.sql);
      record.run(migration.version, migration.name, Date.now());
    });
    apply.immediate();
    applied.push(`${migration.version}_${migration.name}`);
    log.info('migration applied', { version: migration.version, name: migration.name });
  }

  return { from: current, to: LATEST_VERSION, applied };
}

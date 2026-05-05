/**
 * Schema migrations, applied in order and recorded in `schema_migrations`.
 *
 * They live as inline SQL rather than `.sql` files on disk so that `tsc` alone
 * produces a runnable `dist/` — no asset-copy step, and no chance of a
 * packaged build shipping without its schema.
 *
 * Migrations are append-only: never edit a released entry, add a new one.
 */

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

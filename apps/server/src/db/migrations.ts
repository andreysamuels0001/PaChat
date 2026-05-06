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

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    sql: /* sql */ `
      ------------------------------------------------------------------ users
      CREATE TABLE users (
        id               TEXT    PRIMARY KEY,
        email            TEXT    NOT NULL,
        username         TEXT    NOT NULL,
        display_name     TEXT    NOT NULL,
        password_hash    TEXT    NOT NULL,
        avatar_url       TEXT,
        accent_color     TEXT    NOT NULL DEFAULT 'indigo',
        title            TEXT,
        presence_state   TEXT    NOT NULL DEFAULT 'offline'
                                 CHECK (presence_state IN ('online','away','busy','offline')),
        presence_message TEXT,
        last_seen_at     INTEGER NOT NULL DEFAULT 0,
        preferences      TEXT    NOT NULL DEFAULT '{}',
        created_at       INTEGER NOT NULL,
        updated_at       INTEGER NOT NULL
      );

      -- Case-insensitive uniqueness: addresses and handles are normalised to
      -- lowercase on the way in, so a plain unique index is sufficient and
      -- keeps lookups index-only.
      CREATE UNIQUE INDEX users_email_unique    ON users (email);
      CREATE UNIQUE INDEX users_username_unique ON users (username);

      --------------------------------------------------------------- sessions
      CREATE TABLE sessions (
        id                 TEXT    PRIMARY KEY,
        user_id            TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        refresh_token_hash TEXT    NOT NULL,
        user_agent         TEXT,
        ip                 TEXT,
        created_at         INTEGER NOT NULL,
        last_used_at       INTEGER NOT NULL,
        expires_at         INTEGER NOT NULL,
        revoked_at         INTEGER
      );

      CREATE UNIQUE INDEX sessions_refresh_unique ON sessions (refresh_token_hash);
      CREATE INDEX        sessions_by_user        ON sessions (user_id, revoked_at);

      ---------------------------------------------------------- conversations
      CREATE TABLE conversations (
        id         TEXT    PRIMARY KEY,
        kind       TEXT    NOT NULL CHECK (kind IN ('direct','channel')),
        name       TEXT,
        topic      TEXT,
        icon       TEXT,
        is_private INTEGER NOT NULL DEFAULT 0,
        -- For direct conversations: the two member ids, sorted and joined.
        -- The unique index on it makes "open a DM with X" idempotent without
        -- a read-then-write race between two simultaneous clients.
        direct_key TEXT,
        created_by TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE UNIQUE INDEX conversations_direct_key ON conversations (direct_key)
        WHERE direct_key IS NOT NULL;
      CREATE INDEX conversations_by_updated ON conversations (updated_at DESC);

      --------------------------------------------------- conversation_members
      CREATE TABLE conversation_members (
        conversation_id TEXT    NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        user_id         TEXT    NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
        role            TEXT    NOT NULL DEFAULT 'member'
                                CHECK (role IN ('owner','admin','member')),
        joined_at       INTEGER NOT NULL,
        last_read_at    INTEGER NOT NULL DEFAULT 0,
        is_muted        INTEGER NOT NULL DEFAULT 0,
        is_pinned       INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (conversation_id, user_id)
      );

      CREATE INDEX members_by_user ON conversation_members (user_id);

      --------------------------------------------------------------- messages
      CREATE TABLE messages (
        id              TEXT    PRIMARY KEY,
        conversation_id TEXT    NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        author_id       TEXT    NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
        kind            TEXT    NOT NULL DEFAULT 'text'
                                CHECK (kind IN ('text','system')),
        body            TEXT    NOT NULL DEFAULT '',
        reply_to_id     TEXT             REFERENCES messages(id)      ON DELETE SET NULL,
        -- Client-supplied idempotency key. Unique per author so a retried
        -- send after a reconnect resolves to the original row instead of
        -- duplicating the message.
        nonce           TEXT,
        created_at      INTEGER NOT NULL,
        edited_at       INTEGER,
        deleted_at      INTEGER
      );

      -- Ids are time-prefixed, so this one index serves both newest-first
      -- loads and the \`id < cursor\` keyset pagination used for scrollback.
      CREATE INDEX        messages_by_conversation ON messages (conversation_id, id DESC);
      CREATE UNIQUE INDEX messages_nonce_unique    ON messages (author_id, nonce)
        WHERE nonce IS NOT NULL;

      -------------------------------------------------------------- reactions
      CREATE TABLE reactions (
        message_id TEXT    NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        user_id    TEXT    NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
        emoji      TEXT    NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (message_id, user_id, emoji)
      );

      ------------------------------------------------------------ attachments
      CREATE TABLE attachments (
        id          TEXT    PRIMARY KEY,
        -- NULL until the owning message is sent, which lets a client upload
        -- while still composing. Orphans are swept on boot.
        message_id  TEXT             REFERENCES messages(id) ON DELETE CASCADE,
        owner_id    TEXT    NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
        name        TEXT    NOT NULL,
        mime_type   TEXT    NOT NULL,
        byte_size   INTEGER NOT NULL,
        storage_key TEXT    NOT NULL,
        width       INTEGER,
        height      INTEGER,
        created_at  INTEGER NOT NULL
      );

      CREATE INDEX attachments_by_message ON attachments (message_id);
      CREATE INDEX attachments_orphaned   ON attachments (created_at) WHERE message_id IS NULL;
    `,
  },
];

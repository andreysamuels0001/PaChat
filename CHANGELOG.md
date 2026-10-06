# Changelog

All notable changes to PaChat are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The **wire protocol** is versioned separately from the application. A client
and server must agree on `PROTOCOL_VERSION`; a mismatch is refused at the
handshake rather than tolerated.

---

## [1.0.0] — 2026-10-06

First release. Protocol version `1`.

### Added

**Messaging**

- Optimistic sends with nonce-based idempotency, so a retry after a dropped
  connection resolves to the original message instead of duplicating it
- Threaded replies with an inline quote that scrolls to its parent
- Message editing within a 24-hour window, with an `(edited)` marker
- Soft deletion: the row survives as a tombstone so reply previews and read
  cursors pointing at it stay resolvable
- Emoji reactions, aggregated server-side and broadcast as whole message state
  so clients converge regardless of arrival order
- Message grouping for consecutive messages from one author within five minutes
- Day separators and a frozen "new messages" divider
- Inline markup: bold, italic, strikethrough, inline and fenced code,
  blockquotes, and automatic link detection
- `@mention` resolution to display names, with self-mentions highlighted
- File attachments up to 25 MiB with inline image previews at reserved
  intrinsic dimensions

**Real time**

- Presence derived from live sockets — online, away, busy, offline — with a
  grace period and per-member socket counting for multi-window accounts
- Custom status messages
- Typing indicators with leading-edge broadcast, TTL expiry and a process-wide
  janitor
- Read receipts, surfaced as "who has caught up" in the member list
- Per-member unread counts and mention badges
- Multi-device synchronisation via per-member socket rooms
- Automatic reconnection with exponential backoff, jitter and Socket.IO
  connection-state recovery
- Silent access-token refresh when the gateway rejects a stale handshake

**Workspace**

- Public and private channels with owner, admin and member roles
- Direct messages, made idempotent by a unique sorted-pair key at the database
  level
- Full-text search over message bodies using SQLite FTS5 with BM25 ranking,
  scoped by a membership subquery
- Command palette for conversations, members and messages
- Per-member pin and mute
- Member directory grouped by presence

**Desktop**

- Frameless window with a React-drawn titlebar; native traffic lights on macOS
- Native notifications that restore and focus the right conversation on click
- Taskbar and dock unread badge
- Credential storage in the OS keychain via `safeStorage`
- Window geometry persisted and validated against the current display layout
- Single-instance enforcement — a second launch raises the first window
- Dark and light themes, compact density, and reduced-motion support with both
  an OS and an in-app path
- Native application menu with full keyboard coverage
- Installers for Windows (NSIS), macOS (DMG) and Linux (AppImage, deb)

**Server**

- Express REST surface for credentials, token lifecycle and uploads
- Socket.IO gateway with a protocol-versioned, authenticated handshake
- Embedded SQLite with WAL, enforced foreign keys and an FTS5 index
- Versioned, transactional migrations with a schema-version guard
- Seeded demo workspace: five members, three channels, one direct thread,
  twenty messages with replies and reactions
- Per-IP fixed-window limiting on auth; per-member token buckets on sends,
  reactions and typing
- Structured logging — aligned colour in development, JSON in production
- Boot housekeeping: stale presence cleared, expired sessions pruned,
  never-attached uploads removed
- Graceful shutdown that closes sockets before the listener and checkpoints
  the WAL

**Engineering**

- `@pachat/shared`: one Zod-validated contract both ends derive their types
  from, so a breaking protocol change cannot compile on only one side
- Batched hydration — a 50-message page costs four statements regardless of how
  many reactions or attachments it contains
- Keyset pagination over time-prefixed ids, served by a single index
- Message bodies rendered as React elements, never as HTML
- 34-check end-to-end protocol smoke test (`npm run test:e2e`)
- Full documentation: architecture, design system, protocol reference, roadmap

### Security

- bcrypt at cost 12, plus a decoy hash so a failed login is constant-time
  whether or not the account exists
- Refresh tokens stored only as SHA-256 digests, rotated on every use
- Sessions revocable per device, with revocation checked at every handshake
- Renderer sandboxed and context-isolated, with no Node access, a strict CSP
  and a hand-written IPC allow-list
- Opaque attachment storage keys, authenticated downloads, sanitised filenames
  never used as paths
- Production boot refuses to start with placeholder JWT secrets

---

[1.0.0]: https://github.com/andreysamuels0001/pachat/releases/tag/v1.0.0

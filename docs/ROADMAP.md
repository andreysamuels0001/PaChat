# Roadmap

What PaChat does today, what is planned, and what it will deliberately never do.

---

## Shipped — v1.0

### Messaging

- [x] Optimistic sends with nonce-based idempotency and inline retry
- [x] Threaded replies with a quote that scrolls to its parent
- [x] Edit within a 24-hour window; soft delete with tombstoned history
- [x] Emoji reactions, aggregated server-side and broadcast as whole state
- [x] Message grouping, day separators, and a frozen unread divider
- [x] Inline markup — bold, italic, strike, inline and fenced code, quotes, links
- [x] `@mentions` resolved to display names, highlighted when they are you
- [x] File attachments with inline image previews and reserved layout

### Real time

- [x] Presence derived from live sockets, with a grace period and multi-window counting
- [x] Typing indicators with leading-edge broadcast and TTL expiry
- [x] Read receipts, surfaced as "who has caught up" in the member list
- [x] Per-member unread counts and mention badges
- [x] Multi-device sync through per-member socket rooms
- [x] Reconnection with backoff, jitter and connection-state recovery
- [x] Silent access-token refresh on handshake rejection

### Workspace

- [x] Public and private channels with owner / admin / member roles
- [x] Direct messages, idempotent at the database level
- [x] Full-text search over message bodies (SQLite FTS5, BM25 ranked)
- [x] Command palette for conversations, people and messages
- [x] Per-member pin and mute

### Desktop

- [x] Frameless custom titlebar; native traffic lights on macOS
- [x] Native notifications that focus the right conversation
- [x] Taskbar / dock unread badge
- [x] OS-encrypted credential storage via `safeStorage`
- [x] Window geometry restored and validated against current displays
- [x] Single-instance enforcement
- [x] Dark and light themes, compact density, reduced motion
- [x] Native application menu with full keyboard coverage

### Engineering

- [x] One shared, Zod-validated protocol contract for both ends
- [x] Versioned, transactional migrations
- [x] Batched hydration (constant statement count per history page)
- [x] Keyset pagination over time-prefixed ids
- [x] Per-IP and per-member rate limiting
- [x] 34-check end-to-end protocol smoke test (`npm run test:e2e`)

---

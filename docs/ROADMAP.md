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

## Next — v1.1

> Ordered by how much they improve daily use, not by how interesting they are
> to build.

### Message threads as side panels

Replies currently resolve inline, which works well for a short back-and-forth
and poorly for a long one. A right-hand thread panel with its own composer and
unread count, without splitting the main log.

### Voice notes

Record in the composer, store as an attachment, play inline with a waveform.
The attachment pipeline already handles arbitrary binaries; this is a recorder,
a waveform renderer and a duration column.

### Channel management UI

Rename, re-topic, change the icon, promote to admin, and remove members. The
repository and role checks exist; only the interface is missing.

### Jump-to-date

Keyset pagination makes "scroll to 14 March" cheap — an id can be synthesised
from a timestamp, since the timestamp _is_ the id prefix.

### Unit and integration test suite

The smoke test covers the protocol end to end. What is missing is unit coverage
of the pure logic that is easiest to get subtly wrong: `buildRows` grouping,
`isGroupedWith`, the FTS query escaper, `readImageSize`, and the token-bucket
limiter.

---

## Later — v1.2+

### End-to-end encryption for direct messages

The honest version of this is hard: key exchange, device trust, key rotation,
and a decision about whether search works at all on encrypted content. It will
ship when it can ship properly rather than as a checkbox.

### Custom emoji and workspace branding

Upload an emoji set and an accent ramp per deployment. The design system is
already fully tokenised, so the branding half is mostly a settings surface.

### Link unfurling

Fetch Open Graph metadata server-side — never from the renderer, which must not
make arbitrary outbound requests — and cache it by URL.

### Mobile companion

The contract package is platform-agnostic and the server is already remote-ready.
A React Native client would reuse `@pachat/shared` unchanged.

### Message pinning and bookmarks

Per-channel pins and a personal saved-items list.

---

## Explicit non-goals

These are decisions, not omissions.

| Not planned                          | Reasoning                                                                                                                                                                                                          |
| :----------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A hosted service**                 | PaChat is self-hosted by design. Your conversations stay on your own server; that is the point of the project, not a limitation of it.                                                                             |
| **Horizontal scaling**               | The in-memory presence and typing registries have zero operational surface and are correct for a single node. Their interfaces are narrow enough that a shared store would touch two files if the need ever arose. |
| **Video and voice calls**            | A genuinely different product — SFU, TURN, echo cancellation, codec negotiation. Bolting a half-working version onto a text messenger serves nobody.                                                               |
| **Bots and a plugin API**            | A public extension surface is a long-term compatibility commitment. Not until the core protocol has stopped moving.                                                                                                |
| **A full emoji keyboard**            | Several megabytes of dataset plus a search index for something most messages never use. The curated set covers the realistic cases and the OS picker handles the rest.                                             |
| **Markdown tables and nested lists** | Chat messages are sentences, not documents. The supported subset is what people actually type.                                                                                                                     |
| **Read receipts you cannot disable** | They are already a privacy setting, and turning them off hides other people's from you too — reciprocity, rather than one-way observation.                                                                         |

---

## Contributing to the roadmap

Open an issue describing the problem rather than the feature. The most useful
reports explain what you were trying to do, what PaChat made you do instead, and
how often it comes up.

See [CONTRIBUTING.md](../CONTRIBUTING.md).

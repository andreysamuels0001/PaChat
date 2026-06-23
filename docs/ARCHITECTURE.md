# Architecture

How PaChat is put together, and why each boundary sits where it does.

---

## 1 · The three packages

```
@pachat/shared   ──  the contract. No runtime dependencies beyond Zod.
@pachat/server   ──  Express REST + Socket.IO gateway + embedded SQLite.
@pachat/desktop  ──  Electron main / preload / React renderer.
```

The dependency graph is deliberately a **tree, not a web**:

```
desktop ──▶ shared ◀── server
```

Neither application imports the other. Everything they need to agree on lives
in `shared`, and both sides derive their types from the _same_ Zod schemas.
That is the single most load-bearing decision in the codebase: a breaking
protocol change produces a compile error on both ends, not a runtime surprise
after a partial deploy.

---

## 2 · The contract layer

`@pachat/shared` declares four things.

### Domain schemas — `domain.ts`

The wire representation of every entity. Two rules hold throughout:

- **Timestamps are always epoch milliseconds**, never `Date`. A `Date` does not
  survive JSON, and a string timestamp invites per-call-site parsing.
- **Reactions are aggregated server-side.** The client receives
  `{ emoji, count, userIds }`, not one row per reactor, so a message with forty
  reactions is a small payload rather than forty objects.

A `User` is the public projection — safe to broadcast to any peer. `Self`
extends it with the email address and preferences, and is only ever sent to its
own owner.

### Event contract — `events.ts`

Two interfaces describe the complete socket surface:

```ts
interface ClientToServerEvents {
  /* each with a typed ack */
}
interface ServerToClientEvents {
  /* fire-and-forget fan-out */
}
```

Every client→server event answers through a Node-style acknowledgement that is
either `{ ok: true, data }` or `{ ok: false, error }`. **Nothing throws across
the socket boundary** — one malformed payload can never tear down a live
connection and lose every other subscription riding on it.

### HTTP contract — `http.ts`

Deliberately tiny: credentials, token lifecycle, binary uploads. Everything
stateful travels over the socket, which keeps the REST layer stateless and safe
behind any reverse proxy without sticky sessions.

### Pure helpers — `utils.ts`

Id generation, message grouping, mention extraction, relative-time formatting.
These live in `shared` specifically so that a server-generated system message
and a client-rendered one describe people and times identically.

---

## 3 · The server

```
main.ts                boot · housekeeping · graceful shutdown
├── config/env.ts      Zod-validated configuration; refuses bad input at boot
├── db/                connection pragmas · migrations · CLI · demo seed
├── lib/               logger · errors · tokens · password · limiters
├── repositories/      the only code that writes SQL
├── services/          business rules and authorisation
├── http/              Express app, middleware, routes
└── realtime/          the Socket.IO gateway
```

### Layering rules

| Layer               | May import                      | Must not                                  |
| :------------------ | :------------------------------ | :---------------------------------------- |
| `repositories`      | `db`, `lib`, `shared`           | know about HTTP, sockets or authorisation |
| `services`          | `repositories`, `lib`, `shared` | know about transports                     |
| `http` / `realtime` | `services`, `lib`, `shared`     | write SQL                                 |

The practical consequence: **authorisation lives in exactly one place.** Every
conversation handler calls `assertMember(conversationId, viewer)`. There is no
second implementation to forget to update.

### Batched hydration

A page of history costs a constant number of statements regardless of its
contents. `hydrateMessages(rows)` issues:

1. one query for all reactions across the page,
2. one for all attachments,
3. one for all reply parents,

then assembles the domain objects in memory. Fifty messages with four hundred
reactions is four statements, not four hundred.

### Keyset pagination

Ids are time-prefixed, so `id` is simultaneously the sort key and the cursor:

```sql
SELECT * FROM messages
 WHERE conversation_id = ? AND id < ?
 ORDER BY id DESC
 LIMIT ?
```

Served entirely by the `(conversation_id, id DESC)` index. One extra row is
fetched beyond the limit purely to answer _"is there more?"_ without a `COUNT`.

### Idempotent sends

The unique partial index `(author_id, nonce) WHERE nonce IS NOT NULL` is what
makes retries safe. `insertMessage` checks for an existing nonce **inside** the
transaction, so two concurrent retries cannot both win.

### Presence and typing are not persisted truths

Both are derived from live connections and held in memory:

- **Presence** counts sockets per member, so several open windows are one
  online person. "Offline" is published only after the _last_ socket has been
  gone for a grace period — otherwise every reload would flash the workspace
  offline and back.
- **Typing** entries carry their own TTL. One process-wide janitor expires
  them, so a client that disconnects mid-keystroke cannot leave a ghost
  indicator running forever.

Both publish through listener callbacks that the gateway subscribes to, which
keeps the services transport-agnostic.

### Room topology

```
user:<userId>              every device belonging to one member
conversation:<convId>      every member of one conversation
```

The member room is what makes multi-device work: a change is pushed to every
window a person has open, not only the one that caused it. It is also how
**per-member projections** are delivered — unread counts, mute and pin are
private, so each recipient receives their own view of the same conversation
rather than one shared payload that would be wrong for everyone but the sender.

---

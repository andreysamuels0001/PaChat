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

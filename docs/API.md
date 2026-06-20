# Protocol reference

Everything that crosses the wire. Declared once in
[`@pachat/shared`](../packages/shared/src) and validated on arrival.

- **Base URL** — `http://127.0.0.1:4000` by default
- **Socket namespace** — `/chat`
- **Protocol version** — `1`

---

## Conventions

| Rule              | Detail                                                                                                              |
| :---------------- | :------------------------------------------------------------------------------------------------------------------ |
| Timestamps        | Always epoch **milliseconds** as a JSON number. Never a string, never a `Date`.                                     |
| Identifiers       | 24-character, URL-safe, time-prefixed strings. Sorting by id sorts by creation time.                                |
| Errors            | One envelope everywhere: `{ error: { code, message, fields? } }` over HTTP, `{ ok: false, error }` over the socket. |
| Internal failures | Flattened to a generic message. Stack traces and SQL never reach a client.                                          |

### Error codes

| Code                | HTTP | Meaning                                              |
| :------------------ | :--: | :--------------------------------------------------- |
| `UNAUTHORIZED`      | 401  | No token, an invalid token, or a revoked session     |
| `FORBIDDEN`         | 403  | Authenticated, but not permitted                     |
| `NOT_FOUND`         | 404  | No such resource — or none visible to you            |
| `CONFLICT`          | 409  | Uniqueness violation, or an already-applied mutation |
| `VALIDATION_FAILED` | 422  | Schema rejection; `fields` names each offender       |
| `RATE_LIMITED`      | 429  | Over budget; `Retry-After` is set on HTTP            |
| `PROTOCOL_MISMATCH` | 426  | The client speaks a different protocol version       |
| `PAYLOAD_TOO_LARGE` | 413  | Body or upload over the limit                        |
| `INTERNAL_ERROR`    | 500  | Unexpected server failure                            |

---

# REST

Deliberately minimal: credentials, token lifecycle, binary transfer. Everything
stateful travels over the socket.

### `GET /api/health`

Unauthenticated liveness probe.

```json
{
  "status": "ok",
  "service": "pachat-server",
  "version": "1.0.0",
  "protocolVersion": 1,
  "uptimeSeconds": 51,
  "connections": 0,
  "schemaVersion": 2
}
```

### `POST /api/auth/register`

Rate limited. Disabled when `ALLOW_REGISTRATION=false`.

```json
{
  "email": "ada@pachat.app",
  "username": "ada",
  "displayName": "Ada Lovelace",
  "password": "at-least-8-chars",
  "accentColor": "indigo"
}
```

`201` → [`AuthResponse`](#authresponse) · `409` on a taken email or username.

### `POST /api/auth/login`

Rate limited. `identifier` accepts either the email address or the username.

```json
{ "identifier": "ada@pachat.app", "password": "pachat123" }
```

`200` → [`AuthResponse`](#authresponse) · `401` on bad credentials.

> A failed login costs the same wall-clock time whether or not the account
> exists — the password is compared against a decoy hash when the identifier
> matches nothing, which closes the timing channel that otherwise enumerates
> members.

### `POST /api/auth/refresh`

```json
{ "refreshToken": "<opaque>" }
```

`200` → [`AuthResponse`](#authresponse) with a **rotated** refresh token.
The presented token is invalid from this point on, so a replay returns `401`.

### `POST /api/auth/logout`

```json
{ "refreshToken": "<opaque>" }
```

Always `204`, whether or not the token matched a live session. Revocation takes
effect immediately — a still-valid access token for that session is rejected at
its next handshake.

### `GET /api/auth/me`

`Authorization: Bearer <access>` → `{ "self": Self }`

### `POST /api/uploads`

`multipart/form-data`, field name `files`, authenticated.
Up to **10 files**, **25 MiB** each.

`201` → `{ "attachments": Attachment[] }`

Uploads start unowned (`message_id IS NULL`); the ids are bound to a message by
the subsequent `message:send`. Unclaimed uploads are swept after 24 hours.

### `GET /files/:storageKey/:name`

Authenticated download. Readable only by the uploader or by a member of the
conversation the attachment was posted to.

Accepts `?token=<access>` as a fallback to the `Authorization` header, because
`<img src>` cannot carry one. Restricted to `GET`, so a leaked URL cannot
change anything.

---

# Realtime

## Handshake

Sent in the Socket.IO `auth` object. A rejection closes the connection with a
typed `connect_error`, whose `data` carries the standard error envelope.

```ts
{
  token: string,            // access token from /api/auth/login
  protocolVersion: 1,
  client: { name: string, version: string, platform: string }
}
```

| Rejection           | Client should                                                        |
| :------------------ | :------------------------------------------------------------------- |
| `UNAUTHORIZED`      | Refresh the access token and let the next automatic attempt carry it |
| `PROTOCOL_MISMATCH` | Stop retrying and prompt for an update                               |

## `session:ready`

Pushed once, immediately after a successful handshake. **One frame carries
everything the first screen needs** — there is no launch-time request
waterfall.

```ts
{
  self: Self,
  conversations: Conversation[],   // hydrated, with unread state and previews
  users: User[],                   // everyone the viewer can see
  serverTime: number,
  protocolVersion: 1
}
```

---

## Client → server

Every event answers through an acknowledgement:

```ts
type Result<T> = { ok: true; data: T } | { ok: false; error: WireError };
```

Nothing throws across the socket boundary, so one bad payload cannot tear down
a connection and lose every other subscription on it.

| Event                 | Payload                                                       | Acknowledges with    |
| :-------------------- | :------------------------------------------------------------ | :------------------- |
| `conversation:open`   | `{ conversationId }`                                          | `HistoryPage`        |
| `history:fetch`       | `{ conversationId, before?, limit? }`                         | `HistoryPage`        |
| `conversation:create` | `{ name, topic?, icon?, isPrivate?, memberIds? }`             | `{ conversation }`   |
| `conversation:direct` | `{ userId }`                                                  | `{ conversation }`   |
| `conversation:flags`  | `{ conversationId, muted?, pinned? }`                         | `{ conversation }`   |
| `conversation:leave`  | `{ conversationId }`                                          | `{ conversationId }` |
| `message:send`        | `{ conversationId, nonce, body, replyToId?, attachmentIds? }` | `{ message, nonce }` |
| `message:edit`        | `{ messageId, body }`                                         | `{ message }`        |
| `message:delete`      | `{ messageId }`                                               | `{ message }`        |
| `message:react`       | `{ messageId, emoji }`                                        | `{ message }`        |
| `read:advance`        | `{ conversationId, readAt }`                                  | `{ receipt }`        |
| `presence:set`        | `{ state, message? }`                                         | `{ self }`           |
| `profile:update`      | `{ displayName?, title?, accentColor?, avatarUrl? }`          | `{ self }`           |
| `preferences:update`  | `Partial<Preferences>`                                        | `{ self }`           |
| `search:messages`     | `{ query, conversationId?, limit? }`                          | `{ hits }`           |
| `directory:list`      | _(ack only)_                                                  | `{ users }`          |
| `typing:ping`         | `{ conversationId, isTyping }`                                | **no ack**           |

### `message:send` — the important one

```ts
{
  conversationId: string,
  nonce: string,            // client-generated idempotency key, 8–64 chars
  body: string,             // ≤ 4000 chars; may be empty if attachments exist
  replyToId?: string | null,
  attachmentIds?: string[]  // ≤ 10
}
```

**The nonce is what makes retries safe.** A unique partial index on
`(author_id, nonce)` means a retried send after a flaky reconnect resolves to
the original row and acknowledges with the same message id — never a duplicate.
The server does not re-broadcast a deduplicated send; the acknowledgement alone
reconciles the caller's optimistic bubble.

Other guarantees:

- `replyToId` must point into the **same conversation**, so a crafted payload
  cannot quote a message from a channel you cannot see.
- Attachment binding requires `message_id IS NULL` **and** a matching owner, so
  one member cannot attach another's upload.
- Sending advances the author's own read cursor — your message is never shown
  back to you as unread.
- Sending clears your typing indicator immediately.

### `typing:ping` — fire and forget

No acknowledgement by design. A malformed or over-budget ping is dropped
silently: a typing indicator is never worth an error toast. The client throttles
`isTyping: true` to one every 2 s and sends `false` immediately when the
composer empties.

### `read:advance`

The cursor is applied as `MAX(last_read_at, ?)` in SQL, so an out-of-order
acknowledgement from a second device cannot rewind it and resurrect already-read
messages. A `readAt` in the future is clamped to now.

---

## Server → client

All fire-and-forget fan-out.

| Event                   | Payload                       | Sent to                            |
| :---------------------- | :---------------------------- | :--------------------------------- |
| `session:ready`         | `SessionReady`                | The connecting socket              |
| `session:revoked`       | `{ reason }`                  | A session being force-signed-out   |
| `message:created`       | `{ message, nonce? }`         | The conversation room              |
| `message:updated`       | `{ message }`                 | The conversation room              |
| `message:deleted`       | `{ message }`                 | The conversation room              |
| `conversation:upserted` | `{ conversation }`            | **Each member individually**       |
| `conversation:removed`  | `{ conversationId }`          | The member who left                |
| `conversation:members`  | `{ conversationId, members }` | The conversation room              |
| `typing:changed`        | `{ conversationId, userIds }` | The conversation room              |
| `read:changed`          | `ReadReceipt`                 | The conversation room              |
| `presence:changed`      | `{ userId, presence }`        | Everyone who shares a conversation |
| `user:upserted`         | `{ user }`                    | Everyone who shares a conversation |
| `server:error`          | `WireError`                   | The affected socket                |

### Why `conversation:upserted` is per-member

Unread counts, mute and pin are **private to each member**. A single shared
payload would be correct for the sender and wrong for everyone else, so the
gateway builds one projection per recipient and delivers it to that member's
own room.

### Reactions broadcast whole state

`message:react` fans out a `message:updated` carrying the fully rehydrated
message, not a delta. Clients therefore converge on identical state regardless
of the order updates arrive in — which matters because two people can react to
the same message in the same millisecond.

### Room topology

```
user:<userId>            every device belonging to one member
conversation:<convId>    every member of one conversation
```

The member room is what makes multi-device work: a change reaches every window
a person has open, not only the one that caused it.

---

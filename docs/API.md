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

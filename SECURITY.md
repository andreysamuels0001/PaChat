# Security policy

## Reporting a vulnerability

**Please do not open a public issue.**

Email **andreysamuels@outlook.com** with `[PaChat Security]` in the subject, and
include:

- what the issue is and where in the code it lives
- the steps to reproduce it
- what an attacker gains
- the version or commit you tested

You can expect an acknowledgement within 72 hours and an assessment within
seven days. I will tell you when a fix ships and credit you in the release
notes unless you would rather stay anonymous.

Please give a reasonable window for a fix before disclosing publicly.

## Supported versions

| Version | Supported |
| :------ | :-------: |
| 1.x     |    ✅     |
| < 1.0   |    ❌     |

---

## What PaChat does

Documented so you know what is already in place — and so the model is clear if
you find a gap in it.

### Credentials

- **bcrypt at cost 12**, roughly 250 ms per hash: interactive login stays
  snappy while offline cracking of a leaked table stays expensive.
- A **decoy hash** is compared against when the identifier matches no account,
  so a failed login costs the same wall-clock time whether or not the address
  exists. Without this, latency alone enumerates registered members.
- Passwords are never logged, never returned by any endpoint, and the `Self`
  projection has no password field to accidentally serialise.

### Sessions

- **Two tokens.** The access token is a short-lived (15 min) HS256 JWT. The
  refresh token is opaque, long-lived, and stored **only as a SHA-256 digest** —
  a database leak cannot be replayed into live sessions.
- **Rotation on every use.** A stolen refresh token is usable at most once
  before the legitimate client invalidates it, so theft surfaces as an
  unexpected sign-out rather than silent indefinite access.
- **Immediate revocation.** Every handshake re-checks that the session row is
  live, so logout takes effect at once rather than at token expiry.
- **Per-device sessions**, so one device can be signed out without affecting
  the others.
- A **production boot refuses to start** if the JWT secrets are still the
  placeholders from `.env.example`.

### Authorisation

- **One membership gate.** Every conversation handler passes through
  `assertMember(conversationId, viewer)`. There is no second implementation to
  forget to update.
- **Search is scoped by a membership subquery**, which is the authorisation
  boundary itself — no code path can return a message from a channel the viewer
  is not in.
- **Replies must target the same conversation**, so a crafted payload cannot
  quote a message from a channel you cannot see.
- **Attachment binding requires `message_id IS NULL` and a matching owner**, so
  one member cannot attach another member's upload.
- Edits are author-only. Deletes are author-or-moderator.

### Transport and input

- Every inbound payload is parsed with a **Zod schema** before it reaches any
  handler. Nothing is trusted because it arrived over an authenticated socket.
- **Protocol-versioned handshake.** A stale installed build is refused rather
  than allowed to corrupt state after a breaking change.
- JSON bodies are capped at **128 KB**; socket frames at **256 KB**.
- `helmet` sets the standard response headers; CORS is an explicit allow-list.

### Rate limiting

| Surface         | Budget                           |
| :-------------- | :------------------------------- |
| Auth endpoints  | 20/min per IP, fixed window      |
| `message:send`  | burst 10, refill 3/s, per member |
| `message:react` | burst 25, refill 8/s, per member |
| `typing:ping`   | burst 20, refill 5/s, per member |

### Attachments

- **Opaque server-generated storage keys.** The on-disk layout is independent
  of the display name, so a client-supplied filename is never interpreted as a
  path component.
- Filenames are sanitised (control characters and Windows-reserved characters
  stripped) and used only for display and `Content-Disposition`.
- **Downloads are authenticated** — readable by the uploader or by a member of
  the conversation the attachment was posted to. A leaked URL is not enough.
- `X-Content-Type-Options: nosniff` on every download, so a crafted upload
  cannot be sniffed into something executable.
- The `?token=` query fallback exists only because `<img src>` cannot carry a
  header, and is **restricted to `GET`** so a URL alone can never change state.

### The Electron client

- The renderer runs with `contextIsolation: true`, `nodeIntegration: false` and
  `sandbox: true`. **No filesystem, no `require`, no direct Electron access.**
- `ipcRenderer` is **never** exposed. Every capability is a named channel
  declared in `shared-ipc/contract.ts` and surfaced through a hand-written
  preload bridge, so the privileged surface is small and reviewable.
- Each IPC handler **re-validates its own input**; the renderer is treated as
  the least-trusted part of the app.
- A **strict CSP** is injected at the session layer, covering the Vite dev
  server as well as the packaged build. `object-src`, `frame-src` and
  `form-action` are all `none`.
- All navigation away from the bundle — clicked links, crafted anchors, window
  opens — is routed to the OS browser, and only `http(s)` is honoured.
- Permission requests are denied by default; only notifications and sanitised
  clipboard writes are allowed.
- **Credentials live in the OS keychain** via `safeStorage` (DPAPI on Windows,
  Keychain on macOS, libsecret on Linux). Where no secret service is available,
  storage is **refused rather than silently downgraded** to plaintext — the
  user simply signs in each launch.
- The access token is held **in memory only**. It is short-lived and
  re-derivable, so persisting it would widen the blast radius for no benefit.

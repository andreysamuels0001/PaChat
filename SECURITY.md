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

# Contributing to PaChat

Thanks for taking an interest. This document covers how to get set up and what
a reviewable change looks like.

---

## Getting set up

```bash
git clone https://github.com/andreysamuels0001/pachat.git
cd pachat
npm install
npm run setup     # generates secrets, migrates the schema, seeds demo data
npm run dev       # gateway + desktop client
```

**Requirements:** Node.js 20.11+ (22 LTS recommended) and npm 10+. Nothing else.

Sign in with `ada@pachat.app` / `pachat123`.

To watch real-time behaviour, run `npm run dev:desktop` in a second terminal
and sign in as `grace@pachat.app`. Typing in one window shows presence, typing
indicators, messages and read receipts arriving in the other.

---

## Before you open a PR

```bash
npm run typecheck      # all three packages
npm run lint
npm run format:check
npm run test:e2e       # needs `npm run dev:server` running
```

All four should be green. CI runs the same commands.

---

## Where things live

| You want to change               | Start in                                                          |
| :------------------------------- | :---------------------------------------------------------------- |
| A payload that crosses the wire  | `packages/shared/src/` — **always here first**                    |
| A database table or index        | `apps/server/src/db/migrations.ts` — append, never edit           |
| A SQL query                      | `apps/server/src/repositories/`                                   |
| A business rule or permission    | `apps/server/src/services/`                                       |
| A socket event handler           | `apps/server/src/realtime/gateway.ts`                             |
| A colour, radius or duration     | `apps/desktop/src/renderer/src/styles/tokens.css`                 |
| A UI primitive                   | `apps/desktop/src/renderer/src/components/ui/`                    |
| A screen or feature              | `apps/desktop/src/renderer/src/features/`                         |
| Client state                     | `apps/desktop/src/renderer/src/store/`                            |
| A privileged Electron capability | `apps/desktop/src/shared-ipc/contract.ts` — **always here first** |

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains the layering and why each
boundary sits where it does.

---

## Conventions that matter

### Change the contract first

Anything that crosses the wire is declared in `@pachat/shared`. Add the schema
there, then let the compile errors on both sides tell you what to update. This
is the mechanism that keeps the client and server from drifting — please do not
route around it by widening a type locally.

### Migrations are append-only

Never edit a released migration. Database copies in the wild have already
applied it, so an edit produces two different schemas claiming the same version.
Add a new entry instead.

### Respect the layers

Repositories do not know about HTTP or sockets. Services do not know about
transports. Transports do not write SQL. The payoff is that authorisation lives
in exactly one place (`assertMember`), so there is no second implementation to
forget.

### No new colour values

If a component needs a colour, it is either an existing token or the design
system is missing one — in which case add it to `tokens.css` for **both**
themes. A one-off hex value is how a design system quietly stops being one.

### Comments explain _why_

The codebase documents the non-obvious decision, not the obvious mechanism:

```ts
// The cursor is MAX() in SQL rather than a read-compare-write in JS, so an
// out-of-order ack from a second device cannot rewind it and resurrect
// already-read messages as unread.
```

Not:

```ts
// Update the last read timestamp.
```

If a line needs no explanation, it needs no comment.

### Keep motion within budget

120–240 ms on `--ease`. If something needs to be slower to feel right, the
problem is usually the easing or the distance, not the duration.

### Accessibility is not optional

New interactive elements need: a keyboard path, a visible `:focus-visible`
state, an accessible name (`IconButton` enforces this in its type), and a
non-colour signal for any state conveyed by colour.

---

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

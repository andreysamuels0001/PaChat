<div align="center">

<img src="docs/assets/banner.svg" alt="PaChat — real-time conversations, beautifully engineered" width="100%" />

<br />

**A premium, self-hosted real-time chat application for the desktop.**

Presence, typing indicators, read receipts, threaded replies, reactions, file
sharing and full-text search — over a single, strictly typed realtime protocol.

<br />

[![Electron](https://img.shields.io/badge/Electron-44-47848F?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8-010101?style=flat-square&logo=socketdotio&logoColor=white)](https://socket.io/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![SQLite](https://img.shields.io/badge/SQLite-FTS5-003B57?style=flat-square&logo=sqlite&logoColor=white)](https://www.sqlite.org/fts5.html)

[![License: MIT](https://img.shields.io/badge/License-MIT-A855F7?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-6366F1?style=flat-square)](#-installation)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-34D399?style=flat-square)](CONTRIBUTING.md)

<br />

[**Showcase**](#-showcase) · [**Quick start**](#-quick-start) · [**Features**](#-features) · [**Architecture**](#-architecture) · [**Design system**](docs/DESIGN.md) · [**Protocol**](docs/API.md) · [**Roadmap**](docs/ROADMAP.md)

</div>

<br />

---

<br />

## 🖼 Showcase

<div align="center">

<img src="docs/assets/screenshot-dark.svg" alt="The PaChat workspace: channel sidebar with unread badges, a message log with grouped messages, a threaded reply, reactions, a syntax-highlighted code block and an attachment, a live typing indicator, and the member panel grouped by presence" width="100%" />

<br />
<br />

**The workspace** — everything below is one screen, rendered by the real client

</div>

<table>
<tr>
<td width="25%" valign="top"><b>Message log</b><br /><sub>Grouped messages, day separators, a frozen unread divider, threaded reply with the author's accent on the spine.</sub></td>
<td width="25%" valign="top"><b>Live signals</b><br /><sub>Presence rings on avatars, a typing indicator that reserves no space when idle, read receipts in the member list.</sub></td>
<td width="25%" valign="top"><b>Rich content</b><br /><sub>Inline and fenced code, links, <code>@mentions</code>, reactions with your own highlighted, attachments at reserved dimensions.</sub></td>
<td width="25%" valign="top"><b>Desktop chrome</b><br /><sub>Frameless titlebar drawn in React, search affordance with platform-correct shortcut chips, native window controls.</sub></td>
</tr>
</table>

<br />

<table>
<tr>
<td width="50%" align="center">
<img src="docs/assets/screenshot-palette.svg" alt="The command palette with the query 'pagination', showing a matched channel, a matched member, and four full-text message hits with the search term highlighted" width="100%" />
<br />
<b>Command palette</b> · <kbd>Ctrl/⌘</kbd> <kbd>K</kbd>
<br />
<sub>Conversations and members filter locally and instantly; message bodies come back BM25-ranked from SQLite FTS5 with matched terms highlighted.</sub>
</td>
<td width="50%" align="center">
<img src="docs/assets/screenshot-light.svg" alt="The same PaChat workspace rendered in the light theme, showing identical layout with the light token ramp applied" width="100%" />
<br />
<b>Light theme</b>
<br />
<sub>Not a filter — a second complete token ramp. Flipping <code>data-theme</code> re-themes the app and repaints the native window frame with no re-render.</sub>
</td>
</tr>
<tr><td colspan="2"><br /></td></tr>
<tr>
<td width="50%" align="center">
<img src="docs/assets/screenshot-auth.svg" alt="The PaChat sign-in screen: an animated aurora background, the product pitch on the left, and the authentication form with demo credentials on the right" width="100%" />
<br />
<b>Sign-in</b>
<br />
<sub>Transform-only aurora background that runs on the compositor and freezes under <code>prefers-reduced-motion</code>. Seeded credentials are one click away in development.</sub>
</td>
<td width="50%" align="center">
<img src="docs/assets/screenshot-settings.svg" alt="The PaChat settings dialog on the Appearance tab, showing the theme segmented control, compact density and reduced motion switches, and the per-member accent colour swatches" width="100%" />
<br />
<b>Settings</b>
<br />
<sub>Preferences are stored server-side, so they follow the account to any machine — and every toggle applies optimistically before the round-trip confirms it.</sub>
</td>
</tr>
</table>

<br />

> **Want to see it move?** `npm run setup && npm run dev` puts you in a populated
> workspace in under a minute. Launch a second client with `npm run dev:desktop`,
> sign in as a different member, and watch presence, typing, messages, reactions
> and read receipts land live in both windows.

<br />

---

<br />

## Why PaChat

Most chat apps are either a thin wrapper around a hosted service or a toy demo
that stops at "messages appear". PaChat is neither. It is a complete product
built to answer a specific question:

> **What does a real-time messenger look like when the hard parts are actually
> solved — and the result still feels like a premium desktop app?**

The hard parts, concretely:

|                             | The problem                                                     | How PaChat solves it                                                                                                          |
| :-------------------------- | :-------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------- |
| **Duplicate sends**         | A retry after a flaky reconnect posts the message twice.        | Every send carries a client-generated **nonce** under a unique `(author, nonce)` index. A retry resolves to the original row. |
| **Lost drafts**             | Switching channels mid-sentence throws the text away.           | Drafts are held **per conversation** in the store, not in component state.                                                    |
| **Scroll jumping**          | A new message yanks you out of the history you were reading.    | Sticky scroll follows new content **only when you are already at the bottom**.                                                |
| **Shifting pagination**     | `OFFSET` pages shift under you as messages arrive.              | **Keyset pagination** over time-prefixed ids: `WHERE id < ?` is both filter and sort.                                         |
| **Ghost typing indicators** | A client disconnects mid-keystroke; the indicator runs forever. | Each indicator carries its own TTL and is swept by a single process-wide janitor.                                             |
| **Presence flapping**       | Every reload flashes the whole workspace offline.               | Presence is **derived from live sockets** with a grace period, and counts sockets per member for multi-window.                |
| **Notification spam**       | A busy channel becomes an unusable stream of toasts.            | Four conditions must _all_ hold before the OS is notified — including "not already reading it in a focused window".           |
| **Protocol drift**          | The client and server disagree after a deploy.                  | One shared package declares every payload. A breaking change **cannot compile on only one side**.                             |

<br />

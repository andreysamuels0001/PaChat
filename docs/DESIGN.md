# Design system

The visual and interaction language of PaChat. Two ramps, one easing curve, and
a small set of rules applied consistently.

---

## 1 · Principles

**Two ramps, nothing else.** One neutral, one accent. Every surface, border and
piece of text derives from them. This is what keeps the dark and light themes
from drifting into two separately-tuned designs — a token added to one is
necessarily defined in both.

**Colour carries meaning, never decoration.** Accent marks the current
selection and primary action. Semantic colours (success, warning, danger, info)
appear only for state. Per-member accents exist so a busy channel is scannable
by hue rather than by reading names.

**Motion confirms, never announces.** Everything is 120–240 ms on a single
easing curve. Anything slower on a desktop app reads as lag rather than polish,
and anything that moves without being caused by the user is noise.

**Chrome recedes; content does not.** The window frame, sidebar and member
panel sit on recessed surfaces. The message log sits on the base surface and
carries the only full-contrast text in the app.

**Density is a user decision.** Compact mode tightens vertical rhythm without
changing any horizontal measurement, so the text column stays identical and
only the spacing between rows changes.

---

## 2 · Colour

### Neutral ramp

Six surfaces, used strictly by elevation rather than by component:

| Token     | Dark      | Light     | Used for                            |
| :-------- | :-------- | :-------- | :---------------------------------- |
| `sunken`  | `#07080C` | `#ECEEF3` | Inputs, code blocks, recessed rails |
| `base`    | `#0B0C10` | `#F7F8FA` | The window and the message log      |
| `raised`  | `#11131A` | `#FFFFFF` | Cards, the composer, file rows      |
| `overlay` | `#171A23` | `#FFFFFF` | Popovers, toasts, the hover toolbar |
| `hover`   | `#1D212C` | `#F0F2F6` | Hover state                         |
| `active`  | `#242936` | `#E6E9F0` | Pressed state                       |

Borders are **alpha over the surface**, not opaque greys — `6%`, `10%` and
`18%` white in dark, the same values in near-black for light. An alpha border
stays correct on every surface it is drawn on; an opaque one has to be retuned
per elevation.

### Text ramp

| Token       | Contrast role                              |
| :---------- | :----------------------------------------- |
| `ink`       | Message bodies, headings, active labels    |
| `ink-muted` | Secondary labels, inactive sidebar entries |
| `ink-dim`   | Metadata, hints, timestamps on hover       |
| `ink-faint` | Placeholders, section headers, disabled    |

Four levels, not five. Each is a decision about **hierarchy**, so adding a
level means the hierarchy was not clear enough.

### Accent ramp

Indigo into violet: `#6366F1 → #A855F7`. The gradient appears on primary
actions and the brand mark; flat `accent-500` is used for selection,
`accent-300` for accent-coloured text on dark surfaces.

The light theme shifts the ramp one step darker (`accent-500` becomes `#4F46E5`)
because the same indigo that reads as vivid on near-black reads as washed out
on white.

### Per-member accents

Eight hues, assigned deterministically from the username so a new account looks
intentional on first render rather than defaulting to everyone's indigo:

`indigo · violet · cyan · emerald · amber · rose · sky · fuchsia`

Each member's hue is used for their avatar fallback, their name in the message
header, and the spine on replies to them. The light theme darkens every hue for
contrast on white.

### Presence

| State   | Colour    | Meaning                                         |
| :------ | :-------- | :---------------------------------------------- |
| Online  | `#34D399` | Connected, with one expanding ring on the dot   |
| Away    | `#FBBF24` | Self-declared                                   |
| Busy    | `#F87171` | Self-declared; notifications stay quiet         |
| Offline | `#5B6274` | No live socket for longer than the grace period |

The online ring animates once per 2.4 s rather than continuously pulsing, so a
member list of thirty people is not thirty things competing for attention.

---

## 3 · Typography

**Inter Variable** for the interface, **JetBrains Mono Variable** for code.
Both bundled, not fetched — the app must render identically offline and on
first launch.

```css
font-optical-sizing: auto;
font-feature-settings:
  'cv05' 1,
  'cv08' 1,
  'ss03' 1,
  'calt' 1;
```

`ss03` gives straight-sided alternates, which is what makes a lowercase _l_
unambiguous beside a _u_ at 11–13 px — the size most interface text actually
renders at.

### Scale

| Size       | Weight  | Usage                                          |
| :--------- | :------ | :--------------------------------------------- |
| 10.5 px    | 600     | Section headers (uppercase, `0.06em` tracking) |
| 11–11.5 px | 400–500 | Timestamps, metadata, hints                    |
| 12–12.5 px | 400–500 | Secondary labels, previews, tooltips           |
| 13–13.5 px | 400     | **Message bodies** · `line-height: 1.55`       |
| 13.5 px    | 600     | Author names, conversation titles              |
| 14.5 px    | 600     | Conversation header                            |
| 20–22 px   | 600     | Dialog titles, conversation start              |
| 40 px      | 600     | The auth screen headline                       |

Negative tracking (`-0.02em` to `-0.03em`) on everything above 14 px. Inter is
set loose by default at display sizes; tightening it is what makes a heading
read as designed rather than as default.

Message bodies use `1.55` line-height — tighter looks cramped in a dense log,
looser breaks the visual connection between a message's own lines.

---

## 4 · Space and shape

A **4 px base grid**, with the message gutter fixed at **32 px** (the avatar
width) so grouped continuations align perfectly under their leading row.

| Radius | Applied to                                   |
| :----- | :------------------------------------------- |
| 4 px   | Inline code, checkboxes, keyboard chips      |
| 6 px   | Small buttons, menu items, tooltips          |
| 10 px  | Inputs, the composer, file rows, attachments |
| 14 px  | Popovers, cards                              |
| 20 px  | Dialogs, the auth panel                      |
| 28 px  | Icon tiles in empty states                   |
| full   | Avatars, badges, reaction chips              |

Elevation is **layered**, never a single blur — a panel reads as physically
above the surface rather than merely darker:

```css
--shadow-md: 0 4px 12px -2px rgb(0 0 0 / 45%), 0 2px 4px -2px rgb(0 0 0 / 30%);
```

---

## 5 · Motion

One easing curve for everything:

```css
--ease: cubic-bezier(0.22, 1, 0.36, 1); /* fast out, gentle settle */
--duration-fast: 120ms; /* colour, hover, focus */
--duration-base: 180ms; /* panels, dialogs, toasts */
--duration-slow: 240ms; /* layout shifts */
```

### What animates, and what does not

| Animates                                                     | Does not                                               |
| :----------------------------------------------------------- | :----------------------------------------------------- |
| Dialog and popover entry (opacity + 8 px rise + 0.985 scale) | Message insertion — a 400-row log must not cascade     |
| Toast entry and exit, with layout reflow                     | Theme switching — an instant flip reads as intentional |
| The typing indicator's height                                | Scroll position (except explicit "jump to latest")     |
| The connection banner collapsing to zero                     | Sidebar selection, which is a colour change only       |
| The jump-to-latest pill                                      |                                                        |

### Reduced motion

Two independent paths, both honoured:

```css
@media (prefers-reduced-motion: reduce) {
  /* OS setting */
}
:root[data-motion='reduced'] {
  /* in-app toggle, wins over the media query */
}
```

The in-app toggle must win in both directions, so a user who wants motion off
regardless of their OS setting gets it.

---

## 6 · Component anatomy

### Message row

```
┌──────────────────────────────────────────────── hover toolbar (absolute,
│                                                  overlapping the row above
│  ┌────┐  Ada Lovelace  Principal Engineer  09:14  so height never changes)
│  │ AL │  Decision: keyset pagination on message ids
│  └────┘  instead of offset.
│   32px   ┌──────────────────────────────────┐
│  gutter  │  code block, sunken surface      │
│          └──────────────────────────────────┘
│          [🔥 2] [✅ 1]   ← reaction chips, mine outlined in accent
└──────────────────────────────────────────────
```

**Grouped continuation** keeps the same 32 px gutter but replaces the avatar
with a hover-only timestamp, so a run of messages forms one clean text column.

The hover toolbar is absolutely positioned and overlaps the row above. Reserving
space for it would add 32 px of permanent whitespace between every message;
letting it change the row height on hover would make the log jitter under the
pointer.

### Sidebar row

Active state is a **short left bar** (16 px tall, 2.5 px wide) plus a 14%
accent wash — not a full-height border, which reads as a divider rather than a
selection.

Unread uses weight (`600` vs `500`) _and_ a badge. Weight alone is too subtle
at 13.5 px; a badge alone does not survive a glance down the list.

### Composer

Reply context attaches **above** the input with its bottom border removed, so
the two read as one object. Drag-over switches the whole surface to an accent
border with a centred label rather than showing a separate drop zone.

The character counter appears only below 240 remaining, and turns red below 40.
A permanently visible counter on a 4000-character limit is pure noise.

### Empty states

Icon tile, title, one sentence of description, and at most one action. The
description says what to _do_, not that nothing is there — the empty surface
already communicates that.

---

## 7 · Accessibility

| Concern             | Approach                                                                                                                                               |
| :------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focus               | `:focus-visible` only — a visible ring for keyboard users, never on a mouse click. 2 px accent outline, 2 px offset.                                   |
| Dialogs             | Escape closes, focus moves inside on open and returns to the trigger on close, Tab is trapped within the panel.                                        |
| Icon-only controls  | A `label` prop is **required** by the `IconButton` type; there is no way to render one without an accessible name.                                     |
| Live regions        | Toasts and the typing indicator are `aria-live="polite"` — a toast never blocks progress, so interrupting a screen reader would be worse than waiting. |
| Switches            | Real `role="switch"` with `aria-checked`, not a styled checkbox.                                                                                       |
| Contrast            | `ink` on `base` exceeds 7:1 in both themes; `ink-dim` exceeds 4.5:1. `ink-faint` is reserved for text that is decorative or duplicated elsewhere.      |
| Colour independence | Presence is colour _and_ position; unread is weight _and_ a badge; failed sends carry an icon _and_ text.                                              |
| Keyboard            | Every action reachable by mouse has a shortcut or a menu item.                                                                                         |

---

## 8 · Implementation

Tokens are declared once as raw CSS custom properties on `:root`, then mapped
into Tailwind's namespace with `@theme inline`:

```css
:root {
  --c-base: #0b0c10;
}
:root[data-theme='light'] {
  --c-base: #f7f8fa;
}

@theme inline {
  --color-base: var(--c-base);
}
```

`@theme inline` is the important detail: it inlines the `var()` reference
rather than copying the resolved colour, which is what lets `bg-base` follow a
runtime theme change. Flipping `data-theme` on `<html>` re-themes the entire
application with no re-render and no JavaScript beyond setting the attribute.

The native window frame is repainted in the same action, so the titlebar never
disagrees with the content beneath it.

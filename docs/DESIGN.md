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

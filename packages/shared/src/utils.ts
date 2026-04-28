import { ACCENT_COLORS, type AccentColor } from './constants.js';
import type { Conversation, Message, User } from './domain.js';

/* ──────────────────────────────────────────────────────────────────────────────
 * Identifiers
 * ────────────────────────────────────────────────────────────────────────────*/

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/**
 * Creates a 24-character, lexicographically sortable, URL-safe id: an 8-char
 * base36 timestamp prefix followed by 16 chars of randomness.
 *
 * Sorting by id therefore sorts by creation time, which lets the server page
 * message history with a plain `WHERE id < ?` cursor — no compound index and
 * no tie-breaking on identical millisecond timestamps.
 */
export function createId(now: number = Date.now()): string {
  const time = now.toString(36).padStart(8, '0').slice(-8);
  let random = '';
  const bytes = randomBytes(16);
  for (let i = 0; i < 16; i += 1) {
    random += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return time + random;
}

/** Extracts the creation timestamp encoded in an id produced by `createId`. */
export function timestampFromId(id: string): number {
  return Number.parseInt(id.slice(0, 8), 36);
}

/**
 * The Web Crypto surface this module needs, typed structurally.
 *
 * `shared` compiles without the DOM or Node type libraries so it can be
 * imported by the server, the Electron main process and the browser renderer
 * alike — declaring the one method used keeps it free of all three.
 */
interface RandomSource {
  getRandomValues(array: Uint8Array): Uint8Array;
}

function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  const webCrypto = (globalThis as { crypto?: RandomSource }).crypto;
  if (typeof webCrypto?.getRandomValues === 'function') {
    webCrypto.getRandomValues(out);
    return out;
  }
  // Non-crypto fallback for exotic runtimes; ids stay unique, not unguessable.
  for (let i = 0; i < length; i += 1) out[i] = Math.floor(Math.random() * 256);
  return out;
}

/** A disposable idempotency key for an optimistic, not-yet-acknowledged send. */
export function createNonce(): string {
  return `n_${createId()}`;
}

/* ──────────────────────────────────────────────────────────────────────────────
 * Display helpers — shared so the client and server-generated system messages
 * describe people identically.
 * ────────────────────────────────────────────────────────────────────────────*/

/** Up to two uppercase initials, derived from a display name. */
export function initialsOf(displayName: string): string {
  const parts = displayName
    .split(/[\s._-]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Deterministically derives an accent colour from any stable string. */
export function accentFor(seed: string): AccentColor {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return ACCENT_COLORS[Math.abs(hash) % ACCENT_COLORS.length]!;
}

/**
 * Resolves the title shown in the sidebar and header. Channels carry their own
 * name; a direct conversation borrows the other participant's display name.
 */
export function conversationTitle(
  conversation: Pick<Conversation, 'kind' | 'name' | 'members'>,
  selfId: string,
  users: ReadonlyMap<string, Pick<User, 'displayName'>>,
): string {
  if (conversation.name) return conversation.name;
  if (conversation.kind === 'direct') {
    const peer = conversation.members.find((m) => m.userId !== selfId);
    const name = peer ? users.get(peer.userId)?.displayName : undefined;
    return name ?? 'Direct message';
  }
  const names = conversation.members
    .filter((m) => m.userId !== selfId)
    .map((m) => users.get(m.userId)?.displayName)
    .filter((n): n is string => Boolean(n));
  return names.length > 0 ? names.join(', ') : 'Untitled';
}

/** One-line preview used in the sidebar beneath each conversation title. */
export function messagePreview(message: Message | null, authorName?: string): string {
  if (!message) return 'No messages yet';
  if (message.deletedAt) return 'Message deleted';
  const prefix = message.kind === 'system' || !authorName ? '' : `${authorName}: `;
  if (message.body.trim().length === 0 && message.attachments.length > 0) {
    const n = message.attachments.length;
    return `${prefix}${n} attachment${n === 1 ? '' : 's'}`;
  }
  return prefix + message.body.replace(/\s+/g, ' ').trim();
}

/* ──────────────────────────────────────────────────────────────────────────────
 * Formatting
 * ────────────────────────────────────────────────────────────────────────────*/

const KIB = 1024;
const UNITS = ['B', 'KB', 'MB', 'GB'] as const;

export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= KIB && unit < UNITS.length - 1) {
    value /= KIB;
    unit += 1;
  }
  const decimals = unit === 0 || value >= 10 ? 0 : 1;
  return `${value.toFixed(decimals)} ${UNITS[unit]}`;
}

/** "now", "4m", "3h", "Tue", "14 Mar" — compact, sidebar-friendly. */
export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  const delta = Math.max(0, now - timestamp);
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return new Date(timestamp).toLocaleDateString(undefined, { weekday: 'short' });
  }
  return new Date(timestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function formatClockTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "Today", "Yesterday", or a full date — used for day separators in the log. */
export function formatDayLabel(timestamp: number, now: number = Date.now()): string {
  const startOf = (ms: number) => {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const days = Math.round((startOf(now) - startOf(timestamp)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) {
    return new Date(timestamp).toLocaleDateString(undefined, { weekday: 'long' });
  }
  return new Date(timestamp).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: startOf(now) - startOf(timestamp) > 300 * 86_400_000 ? 'numeric' : undefined,
  });
}

/**
 * Renders a human sentence for a typing set: "Ada is typing", "Ada and Linus
 * are typing", "Ada and 4 others are typing".
 */
export function formatTypingSentence(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return `${names[0]} is typing`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing`;
  return `${names[0]} and ${names.length - 1} others are typing`;
}

/* ──────────────────────────────────────────────────────────────────────────────
 * Grouping
 * ────────────────────────────────────────────────────────────────────────────*/

/** Window inside which consecutive messages from one author are grouped. */
export const GROUPING_WINDOW_MS = 5 * 60 * 1000;

/**
 * True when `message` should render as a continuation of `previous` — same
 * author, close in time, same day, and neither is a system notice.
 */
export function isGroupedWith(message: Message, previous: Message | undefined): boolean {
  if (!previous) return false;
  if (message.kind === 'system' || previous.kind === 'system') return false;
  if (message.authorId !== previous.authorId) return false;
  if (message.replyTo) return false;
  if (message.createdAt - previous.createdAt > GROUPING_WINDOW_MS) return false;
  return new Date(message.createdAt).toDateString() === new Date(previous.createdAt).toDateString();
}

/* ──────────────────────────────────────────────────────────────────────────────
 * Mentions
 * ────────────────────────────────────────────────────────────────────────────*/

const MENTION_PATTERN = /(^|[\s(])@([a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)/gi;

/** Extracts the distinct usernames mentioned in a message body. */
export function extractMentions(body: string): string[] {
  const found = new Set<string>();
  for (const match of body.matchAll(MENTION_PATTERN)) {
    if (match[2]) found.add(match[2].toLowerCase());
  }
  return [...found];
}

/** True when `body` mentions `username`, or addresses the whole channel. */
export function mentions(body: string, username: string): boolean {
  const found = extractMentions(body);
  return found.includes(username.toLowerCase()) || found.includes('everyone');
}

/* ──────────────────────────────────────────────────────────────────────────────
 * Misc
 * ────────────────────────────────────────────────────────────────────────────*/

/** Collapses whitespace and clips to `max` characters with an ellipsis. */
export function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Escapes a string for safe interpolation into HTML. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

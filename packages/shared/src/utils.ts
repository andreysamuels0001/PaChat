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

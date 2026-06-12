import { TIMINGS } from '@pachat/shared';

/**
 * Who is currently typing, per conversation.
 *
 * Deliberately in-memory and ephemeral — a typing indicator has no value a
 * second after it is stale, so persisting it would be pure cost. Each entry
 * carries its own expiry; the first read after the TTL elapses drops it, which
 * means a client that disconnects mid-keystroke cannot leave a ghost indicator
 * running forever.
 */

/** conversationId → (userId → expiry timestamp) */
const typing = new Map<string, Map<string, number>>();

export type TypingListener = (conversationId: string, userIds: string[]) => void;

const listeners = new Set<TypingListener>();

export function onTypingChange(listener: TypingListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(conversationId: string): void {
  const userIds = activeIn(conversationId);
  for (const listener of listeners) listener(conversationId, userIds);
}

/** Drops expired entries. Returns true when anything was removed. */
function sweep(conversationId: string, now: number): boolean {
  const room = typing.get(conversationId);
  if (!room) return false;

  let changed = false;
  for (const [userId, expiresAt] of room) {
    if (expiresAt <= now) {
      room.delete(userId);
      changed = true;
    }
  }
  if (room.size === 0) typing.delete(conversationId);
  return changed;
}

/** Records (or refreshes) a typing indicator and notifies listeners. */
export function start(conversationId: string, userId: string, now = Date.now()): void {
  sweep(conversationId, now);

  const room = typing.get(conversationId) ?? new Map<string, number>();
  const wasPresent = room.has(userId);
  room.set(userId, now + TIMINGS.typingTtlMs);
  typing.set(conversationId, room);

  // Only broadcast on the leading edge. A refresh from continued typing does
  // not change what any client renders, so re-sending would be pure fan-out.
  if (!wasPresent) emit(conversationId);
}

export function stop(conversationId: string, userId: string): void {
  const room = typing.get(conversationId);
  if (!room?.delete(userId)) return;
  if (room.size === 0) typing.delete(conversationId);
  emit(conversationId);
}

/** Clears a member from every conversation — called when their socket drops. */
export function clearUser(userId: string): void {
  for (const [conversationId, room] of [...typing]) {
    if (room.delete(userId)) {
      if (room.size === 0) typing.delete(conversationId);
      emit(conversationId);
    }
  }
}

export function activeIn(conversationId: string, now = Date.now()): string[] {
  sweep(conversationId, now);
  return [...(typing.get(conversationId)?.keys() ?? [])];
}

/**
 * A single interval that expires indicators the clients would otherwise keep
 * rendering — one timer for the whole process rather than one per keystroke.
 */
let janitor: NodeJS.Timeout | null = null;

export function startJanitor(intervalMs = 1_000): void {
  if (janitor) return;
  janitor = setInterval(() => {
    const now = Date.now();
    for (const conversationId of [...typing.keys()]) {
      if (sweep(conversationId, now)) emit(conversationId);
    }
  }, intervalMs);
  janitor.unref?.();
}

export function stopJanitor(): void {
  if (!janitor) return;
  clearInterval(janitor);
  janitor = null;
}

export function reset(): void {
  typing.clear();
}

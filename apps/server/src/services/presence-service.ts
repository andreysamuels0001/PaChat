import { TIMINGS, type PresenceState } from '@pachat/shared';
import { createLogger } from '../lib/logger.js';
import * as users from '../repositories/users.js';

const log = createLogger('presence');

/**
 * Presence is derived from live socket connections, not stored as the truth.
 *
 * One member may have several windows open, so the registry counts sockets per
 * user. "Offline" is only published once the *last* socket has been gone for
 * `presenceGraceMs` — without that grace period, every page reload or network
 * blip would flash the whole workspace offline and back.
 */

interface Entry {
  sockets: Set<string>;
  /** The state the member chose; connection state can only downgrade it. */
  declared: Exclude<PresenceState, 'offline'>;
  offlineTimer: NodeJS.Timeout | null;
}

export type PresenceListener = (
  userId: string,
  presence: { state: PresenceState; message: string | null; lastSeenAt: number },
) => void;

const entries = new Map<string, Entry>();
const listeners = new Set<PresenceListener>();

export function onPresenceChange(listener: PresenceListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(userId: string): void {
  const row = users.findUserById(userId);
  if (!row) return;
  const presence = {
    state: row.presence_state as PresenceState,
    message: row.presence_message,
    lastSeenAt: row.last_seen_at,
  };
  for (const listener of listeners) {
    try {
      listener(userId, presence);
    } catch (error) {
      log.error('presence listener threw', { err: error, userId });
    }
  }
}

/** Registers a newly authenticated socket and brings the member online. */
export function attach(userId: string, socketId: string): void {
  let entry = entries.get(userId);
  if (!entry) {
    entry = { sockets: new Set(), declared: 'online', offlineTimer: null };
    entries.set(userId, entry);
  }

  entry.sockets.add(socketId);

  if (entry.offlineTimer) {
    clearTimeout(entry.offlineTimer);
    entry.offlineTimer = null;
  }

  const row = users.findUserById(userId);
  // Honour a sticky "busy"/"away" the member set earlier; only promote from
  // offline, so reconnecting does not silently reset a do-not-disturb state.
  const next =
    row && row.presence_state !== 'offline'
      ? (row.presence_state as Entry['declared'])
      : entry.declared;
  entry.declared = next;

  users.setPresence(userId, next);
  publish(userId);
  log.debug('socket attached', { userId, sockets: entry.sockets.size });
}

/** Deregisters a socket; schedules the offline transition if it was the last. */
export function detach(userId: string, socketId: string): void {
  const entry = entries.get(userId);
  if (!entry) return;

  entry.sockets.delete(socketId);
  users.touchLastSeen(userId);

  if (entry.sockets.size > 0) {
    log.debug('socket detached', { userId, remaining: entry.sockets.size });
    return;
  }

  entry.offlineTimer = setTimeout(() => {
    const current = entries.get(userId);
    // Re-check: a reconnect inside the grace window must cancel the
    // transition, and the timer may have been scheduled before it arrived.
    if (!current || current.sockets.size > 0) return;
    users.setPresence(userId, 'offline');
    entries.delete(userId);
    publish(userId);
    log.debug('went offline', { userId });
  }, TIMINGS.presenceGraceMs);

  entry.offlineTimer.unref?.();
}

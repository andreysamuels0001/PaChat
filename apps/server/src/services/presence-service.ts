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

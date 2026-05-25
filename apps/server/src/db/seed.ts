import { createId, DEFAULT_PREFERENCES } from '@pachat/shared';
import { getDb, transaction } from './index.js';
import { hashPassword } from '../lib/password.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('seed');

/**
 * Seeds a believable demo workspace: five members, three channels, one direct
 * thread and a realistic back-and-forth with replies and reactions.
 *
 * The point is that `npm run dev` on a clean checkout lands you in a populated
 * app — every surface (grouping, day separators, unread badges, reactions,
 * typing, read receipts) has something to render immediately.
 */

const DEMO_PASSWORD = 'pachat123';

interface SeedUser {
  key: string;
  email: string;
  username: string;
  displayName: string;
  title: string;
  accent: string;
  presence: 'online' | 'away' | 'busy' | 'offline';
  statusMessage: string | null;
}

const USERS: SeedUser[] = [
  {
    key: 'ada',
    email: 'ada@pachat.app',
    username: 'ada',
    displayName: 'Ada Lovelace',
    title: 'Principal Engineer',
    accent: 'indigo',
    presence: 'online',
    statusMessage: 'Shipping the realtime layer',
  },
  {
    key: 'grace',
    email: 'grace@pachat.app',
    username: 'grace',
    displayName: 'Grace Hopper',
    title: 'Director of Engineering',
    accent: 'violet',
    presence: 'online',
    statusMessage: null,
  },
  {
    key: 'alan',
    email: 'alan@pachat.app',
    username: 'alan',
    displayName: 'Alan Turing',
    title: 'Research Lead',
    accent: 'cyan',
    presence: 'busy',
    statusMessage: 'Deep work until 4',
  },
  {
    key: 'katherine',
    email: 'katherine@pachat.app',
    username: 'katherine',
    displayName: 'Katherine Johnson',
    title: 'Staff Product Designer',
    accent: 'amber',
    presence: 'away',
    statusMessage: 'Back in 20',
  },
  {
    key: 'linus',
    email: 'linus@pachat.app',
    username: 'linus',
    displayName: 'Linus Torvalds',
    title: 'Infrastructure',
    accent: 'emerald',
    presence: 'offline',
    statusMessage: null,
  },
];

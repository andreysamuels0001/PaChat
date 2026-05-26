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

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

interface SeedMessage {
  author: string;
  body: string;
  /** Minutes before "now" that this message was sent. */
  ago: number;
  replyTo?: number;
  reactions?: Array<{ emoji: string; by: string[] }>;
}

interface SeedChannel {
  key: string;
  name: string;
  topic: string;
  icon: string;
  isPrivate: boolean;
  owner: string;
  members: string[];
  messages: SeedMessage[];
}

const CHANNELS: SeedChannel[] = [
  {
    key: 'general',
    name: 'general',
    topic: 'Company-wide announcements and anything that does not have a home yet',
    icon: '🌐',
    isPrivate: false,
    owner: 'grace',
    members: ['ada', 'grace', 'alan', 'katherine', 'linus'],
    messages: [
      {
        author: 'grace',
        body: 'Morning everyone. Standup notes are in the thread below.',
        ago: (3 * DAY) / MINUTE,
      },
      {
        author: 'ada',
        body: 'The new realtime gateway is deployed to staging. Reconnect handling is the part I would most like eyes on.',
        ago: (3 * DAY - 40 * MINUTE) / MINUTE,
        reactions: [
          { emoji: '🚀', by: ['grace', 'alan', 'katherine'] },
          { emoji: '👀', by: ['linus'] },
        ],
      },
      {
        author: 'linus',
        body: 'Pulled it locally. Socket resume after a laptop sleep is clean — no duplicate messages, which is the bug I expected to find.',
        ago: (3 * DAY - 95 * MINUTE) / MINUTE,
        replyTo: 1,
        reactions: [{ emoji: '✅', by: ['ada'] }],
      },
      {
        author: 'katherine',
        body: 'Design review moved to 15:00 so the whole platform group can make it. Figma link is pinned in #design.',
        ago: (2 * DAY) / MINUTE,
      },
      {
        author: 'alan',
        body: 'I will be a few minutes late — finishing a benchmark run.',
        ago: (2 * DAY - 10 * MINUTE) / MINUTE,
        replyTo: 3,
      },
      {
        author: 'grace',
        body: 'Reminder that we freeze on Thursday. Anything not merged by then rides the next train.',
        ago: (6 * HOUR) / MINUTE,
        reactions: [{ emoji: '👍', by: ['ada', 'alan', 'katherine', 'linus'] }],
      },
      {
        author: 'ada',
        body: '@everyone the release notes draft is ready for review. Two paragraphs, should take a minute.',
        ago: 42,
        reactions: [{ emoji: '🎉', by: ['katherine'] }],
      },
      { author: 'katherine', body: 'Reading it now.', ago: 18 },
    ],
  },
  {
    key: 'engineering',
    name: 'engineering',
    topic: 'Architecture, reviews, incidents',
    icon: '⚙️',
    isPrivate: false,
    owner: 'ada',
    members: ['ada', 'alan', 'linus', 'grace'],
    messages: [
      {
        author: 'ada',
        body: 'Decision: keyset pagination on message ids instead of offset. Ids are time-prefixed so `WHERE id < ?` is both the sort and the cursor.',
        ago: (4 * DAY) / MINUTE,
        reactions: [{ emoji: '🔥', by: ['linus', 'alan'] }],
      },
      {
        author: 'linus',
        body: 'Agreed. Offset pagination on a live feed shifts under you the moment someone sends a message.',
        ago: (4 * DAY - 25 * MINUTE) / MINUTE,
        replyTo: 0,
      },
      {
        author: 'alan',
        body: 'I added an FTS5 external-content index for search. Index-only, bodies are not duplicated.',
        ago: (1 * DAY) / MINUTE,
      },
      {
        author: 'ada',
        body: 'Nice. Remember the delete sentinel in the update trigger, otherwise stale terms keep matching.',
        ago: (1 * DAY - 15 * MINUTE) / MINUTE,
        replyTo: 2,
        reactions: [{ emoji: '👍', by: ['alan'] }],
      },
      {
        author: 'linus',
        body: 'WAL mode plus a 5s busy timeout held up fine at 2k msg/min locally.',
        ago: 150,
      },
    ],
  },
  {
    key: 'design',
    name: 'design',
    topic: 'Design system, motion, critique',
    icon: '🎨',
    isPrivate: false,
    owner: 'katherine',
    members: ['katherine', 'ada', 'grace'],
    messages: [
      {
        author: 'katherine',
        body: 'Shipped the token pass: one accent ramp, one neutral ramp, and every surface derives from them. No more one-off hex values.',
        ago: (2 * DAY) / MINUTE,
        reactions: [{ emoji: '❤️', by: ['ada', 'grace'] }],
      },
      {
        author: 'grace',
        body: 'The density toggle is the detail I keep coming back to. Compact mode makes long channels genuinely scannable.',
        ago: (2 * DAY - 70 * MINUTE) / MINUTE,
      },
      {
        author: 'katherine',
        body: 'Motion is all 120–220ms with a single easing curve, and it is fully disabled when the OS asks for reduced motion.',
        ago: 95,
        reactions: [{ emoji: '✅', by: ['grace'] }],
      },
    ],
  },
];

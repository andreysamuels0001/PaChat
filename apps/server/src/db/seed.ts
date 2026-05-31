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

interface SeedDirect {
  a: string;
  b: string;
  messages: SeedMessage[];
}

const DIRECTS: SeedDirect[] = [
  {
    a: 'ada',
    b: 'grace',
    messages: [
      { author: 'grace', body: 'Do you have ten minutes before the review?', ago: 240 },
      { author: 'ada', body: 'Yes — I will grab a room.', ago: 232 },
      {
        author: 'grace',
        body: 'Perfect. I mostly want to talk through the reconnect story so I can explain it on Thursday.',
        ago: 228,
      },
      {
        author: 'ada',
        body: 'Easy. Short version: every send carries a nonce, so retries are idempotent.',
        ago: 12,
      },
    ],
  },
];

export async function seedDatabase(): Promise<void> {
  const db = getDb();

  const existing = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
  if (existing.n > 0) {
    log.warn('database already contains users — skipping seed', { users: existing.n });
    return;
  }

  // Hash once: every demo account shares the same password, and bcrypt at
  // cost 12 is deliberately slow.
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const now = Date.now();
  const userIds = new Map<string, string>();

  transaction(() => {
    const insertUser = db.prepare(`
      INSERT INTO users (
        id, email, username, display_name, password_hash, avatar_url, accent_color,
        title, presence_state, presence_message, last_seen_at, preferences,
        created_at, updated_at
      ) VALUES (
        @id, @email, @username, @displayName, @passwordHash, NULL, @accent,
        @title, @presence, @statusMessage, @lastSeenAt, @preferences,
        @createdAt, @updatedAt
      )
    `);

    USERS.forEach((user, index) => {
      const id = createId(now - (USERS.length - index) * DAY);
      userIds.set(user.key, id);
      insertUser.run({
        id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        passwordHash,
        accent: user.accent,
        title: user.title,
        presence: user.presence,
        statusMessage: user.statusMessage,
        lastSeenAt: user.presence === 'offline' ? now - 8 * HOUR : now - 2 * MINUTE,
        preferences: JSON.stringify({ ...DEFAULT_PREFERENCES, accentColor: user.accent }),
        createdAt: now - (USERS.length - index) * DAY,
        updatedAt: now,
      });
    });

    const idOf = (key: string): string => {
      const id = userIds.get(key);
      if (!id) throw new Error(`seed references unknown user "${key}"`);
      return id;
    };

    const insertConversation = db.prepare(`
      INSERT INTO conversations (
        id, kind, name, topic, icon, is_private, direct_key, created_by, created_at, updated_at
      ) VALUES (
        @id, @kind, @name, @topic, @icon, @isPrivate, @directKey, @createdBy, @createdAt, @updatedAt
      )
    `);

    const insertMember = db.prepare(`
      INSERT INTO conversation_members (
        conversation_id, user_id, role, joined_at, last_read_at, is_muted, is_pinned
      ) VALUES (@conversationId, @userId, @role, @joinedAt, @lastReadAt, 0, @isPinned)
    `);

    const insertMessage = db.prepare(`
      INSERT INTO messages (
        id, conversation_id, author_id, kind, body, reply_to_id, nonce, created_at
      ) VALUES (@id, @conversationId, @authorId, 'text', @body, @replyToId, NULL, @createdAt)
    `);

    const insertReaction = db.prepare(`
      INSERT INTO reactions (message_id, user_id, emoji, created_at)
      VALUES (@messageId, @userId, @emoji, @createdAt)
    `);

    const touchConversation = db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?');
    const markRead = db.prepare(
      'UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?',
    );

    /** Writes a message list and returns the created ids, in order. */
    const writeMessages = (conversationId: string, messages: SeedMessage[]): string[] => {
      const ids: string[] = [];
      let newest = 0;

      messages.forEach((message) => {
        const createdAt = now - message.ago * MINUTE;
        const id = createId(createdAt);
        ids.push(id);
        newest = Math.max(newest, createdAt);
        insertMessage.run({
          id,
          conversationId,
          authorId: idOf(message.author),
          body: message.body,
          replyToId: message.replyTo !== undefined ? (ids[message.replyTo] ?? null) : null,
          createdAt,
        });
        for (const reaction of message.reactions ?? []) {
          for (const who of reaction.by) {
            insertReaction.run({
              messageId: id,
              userId: idOf(who),
              emoji: reaction.emoji,
              createdAt: createdAt + MINUTE,
            });
          }
        }
      });

      if (newest > 0) touchConversation.run(newest, conversationId);
      return ids;
    };

    // ── Channels ──────────────────────────────────────────────────────────
    for (const channel of CHANNELS) {
      const createdAt = now - 10 * DAY;
      const conversationId = createId(createdAt);

      insertConversation.run({
        id: conversationId,
        kind: 'channel',
        name: channel.name,
        topic: channel.topic,
        icon: channel.icon,
        isPrivate: channel.isPrivate ? 1 : 0,
        directKey: null,
        createdBy: idOf(channel.owner),
        createdAt,
        updatedAt: createdAt,
      });

      for (const member of channel.members) {
        insertMember.run({
          conversationId,
          userId: idOf(member),
          role: member === channel.owner ? 'owner' : 'member',
          joinedAt: createdAt,
          // Everyone is caught up except Ada in #general, so the very first
          // render shows a real unread badge rather than an empty state.
          lastReadAt: member === 'ada' && channel.key === 'general' ? now - 2 * HOUR : now,
          isPinned: channel.key === 'general' ? 1 : 0,
        });
      }

      writeMessages(conversationId, channel.messages);
    }

    // ── Direct messages ───────────────────────────────────────────────────
    for (const direct of DIRECTS) {
      const createdAt = now - 5 * DAY;
      const conversationId = createId(createdAt);
      const pair = [idOf(direct.a), idOf(direct.b)].sort();

      insertConversation.run({
        id: conversationId,
        kind: 'direct',
        name: null,
        topic: null,
        icon: null,
        isPrivate: 1,
        directKey: pair.join(':'),
        createdBy: idOf(direct.a),
        createdAt,
        updatedAt: createdAt,
      });

      for (const member of [direct.a, direct.b]) {
        insertMember.run({
          conversationId,
          userId: idOf(member),
          role: 'member',
          joinedAt: createdAt,
          lastReadAt: now,
          isPinned: 0,
        });
      }

      const ids = writeMessages(conversationId, direct.messages);
      // Leave the final inbound line unread for Grace.
      const last = ids[ids.length - 1];
      if (last) markRead.run(now - 30 * MINUTE, conversationId, idOf('grace'));
    }
  });

  const counts = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM users)         AS users,
         (SELECT COUNT(*) FROM conversations) AS conversations,
         (SELECT COUNT(*) FROM messages)      AS messages,
         (SELECT COUNT(*) FROM reactions)     AS reactions`,
    )
    .get() as Record<string, number>;

  log.info('demo workspace seeded', counts);
  log.info(`sign in with any of: ${USERS.map((u) => u.email).join(', ')}`);
  log.info(`password: ${DEMO_PASSWORD}`);
}

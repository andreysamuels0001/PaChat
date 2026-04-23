import { z } from 'zod';
import { ACCENT_COLORS, LIMITS } from './constants.js';

/* ──────────────────────────────────────────────────────────────────────────────
 * Primitives
 * ────────────────────────────────────────────────────────────────────────────*/

/** Sortable, URL-safe 24-char identifier produced by `createId()`. */
export const idSchema = z
  .string()
  .regex(/^[0-9a-z]{20,28}$/, 'malformed identifier')
  .describe('Lexicographically sortable public identifier');

/** Epoch milliseconds. The wire format is always numeric — never a Date. */
export const timestampSchema = z.number().int().nonnegative();

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(LIMITS.usernameMin)
  .max(LIMITS.usernameMax)
  .regex(/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/, 'use letters, digits, dot, dash or underscore');

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const passwordSchema = z.string().min(LIMITS.passwordMin).max(LIMITS.passwordMax);

export const accentColorSchema = z.enum(ACCENT_COLORS);

/* ──────────────────────────────────────────────────────────────────────────────
 * Presence
 * ────────────────────────────────────────────────────────────────────────────*/

export const presenceStateSchema = z.enum(['online', 'away', 'busy', 'offline']);
export type PresenceState = z.infer<typeof presenceStateSchema>;

export const presenceSchema = z.object({
  userId: idSchema,
  state: presenceStateSchema,
  /** Free-text status line, e.g. "Shipping v1.2". */
  message: z.string().max(LIMITS.statusMessage).nullable(),
  /** When the member was last observed on any device. */
  lastSeenAt: timestampSchema,
});
export type Presence = z.infer<typeof presenceSchema>;

/* ──────────────────────────────────────────────────────────────────────────────
 * Users
 * ────────────────────────────────────────────────────────────────────────────*/

/** The public projection of a member — safe to broadcast to any peer. */
export const userSchema = z.object({
  id: idSchema,
  username: usernameSchema,
  displayName: z.string().min(1).max(LIMITS.displayName),
  /** Absolute URL, or `null` to fall back to generated initials. */
  avatarUrl: z.string().url().nullable(),
  accentColor: accentColorSchema,
  /** Short role/title shown in the member list, e.g. "Staff Engineer". */
  title: z.string().max(64).nullable(),
  presence: presenceSchema.omit({ userId: true }),
  createdAt: timestampSchema,
});
export type User = z.infer<typeof userSchema>;

/** The authenticated user's own record, which carries private fields. */
export const selfSchema = userSchema.extend({
  email: emailSchema,
  /** Per-account preferences persisted server-side so they follow the user. */
  preferences: z.object({
    theme: z.enum(['dark', 'light', 'system']),
    accentColor: accentColorSchema,
    /** Enter sends; Shift+Enter inserts a newline — or the inverse. */
    enterToSend: z.boolean(),
    reduceMotion: z.boolean(),
    desktopNotifications: z.boolean(),
    notificationSound: z.boolean(),
    compactDensity: z.boolean(),
    showReadReceipts: z.boolean(),
  }),
});
export type Self = z.infer<typeof selfSchema>;

export const preferencesSchema = selfSchema.shape.preferences;
export type Preferences = z.infer<typeof preferencesSchema>;

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'dark',
  accentColor: 'indigo',
  enterToSend: true,
  reduceMotion: false,
  desktopNotifications: true,
  notificationSound: true,
  compactDensity: false,
  showReadReceipts: true,
};

/* ──────────────────────────────────────────────────────────────────────────────
 * Attachments
 * ────────────────────────────────────────────────────────────────────────────*/

export const attachmentSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(255),
  mimeType: z.string().min(3).max(127),
  byteSize: z.number().int().positive().max(LIMITS.attachmentBytes),
  /** Server-relative download path, e.g. `/files/<id>/<name>`. */
  url: z.string().min(1),
  /** Intrinsic dimensions for images, so the client can reserve layout space. */
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
});
export type Attachment = z.infer<typeof attachmentSchema>;

/* ──────────────────────────────────────────────────────────────────────────────
 * Reactions
 * ────────────────────────────────────────────────────────────────────────────*/

/** Aggregated per emoji so the client never receives one row per reactor. */
export const reactionSchema = z.object({
  emoji: z.string().min(1).max(16),
  count: z.number().int().nonnegative(),
  /** Ids of reacting members, capped server-side for very large rooms. */
  userIds: z.array(idSchema),
});
export type Reaction = z.infer<typeof reactionSchema>;

/* ──────────────────────────────────────────────────────────────────────────────
 * Messages
 * ────────────────────────────────────────────────────────────────────────────*/

export const messageKindSchema = z.enum(['text', 'system']);
export type MessageKind = z.infer<typeof messageKindSchema>;

/** A lightweight quote of the parent message, embedded in replies. */
export const replyPreviewSchema = z.object({
  id: idSchema,
  authorId: idSchema,
  /** Truncated to a single line by the server. */
  excerpt: z.string(),
  /** True when the parent has since been deleted. */
  isDeleted: z.boolean(),
});
export type ReplyPreview = z.infer<typeof replyPreviewSchema>;

export const messageSchema = z.object({
  id: idSchema,
  conversationId: idSchema,
  authorId: idSchema,
  kind: messageKindSchema,
  /** Empty string is legal when the message carries only attachments. */
  body: z.string().max(LIMITS.messageBody),
  attachments: z.array(attachmentSchema),
  reactions: z.array(reactionSchema),
  replyTo: replyPreviewSchema.nullable(),
  createdAt: timestampSchema,
  editedAt: timestampSchema.nullable(),
  /** Tombstoned messages keep their slot in history but lose their body. */
  deletedAt: timestampSchema.nullable(),
});
export type Message = z.infer<typeof messageSchema>;

/* ──────────────────────────────────────────────────────────────────────────────
 * Conversations
 * ────────────────────────────────────────────────────────────────────────────*/

export const conversationKindSchema = z.enum(['direct', 'channel']);
export type ConversationKind = z.infer<typeof conversationKindSchema>;

export const memberRoleSchema = z.enum(['owner', 'admin', 'member']);
export type MemberRole = z.infer<typeof memberRoleSchema>;

export const conversationMemberSchema = z.object({
  userId: idSchema,
  role: memberRoleSchema,
  joinedAt: timestampSchema,
  /** Timestamp of the newest message this member has acknowledged. */
  lastReadAt: timestampSchema,
});
export type ConversationMember = z.infer<typeof conversationMemberSchema>;

export const conversationSchema = z.object({
  id: idSchema,
  kind: conversationKindSchema,
  /** `null` for direct messages — the client renders the peer's name instead. */
  name: z.string().min(1).max(64).nullable(),
  topic: z.string().max(LIMITS.conversationTopic).nullable(),
  /** Single emoji used as the channel glyph in the sidebar. */
  icon: z.string().max(8).nullable(),
  isPrivate: z.boolean(),
  members: z.array(conversationMemberSchema),
  /** Denormalised for sidebar ordering and preview without an extra round-trip. */
  lastMessage: messageSchema.nullable(),
  unreadCount: z.number().int().nonnegative(),
  /** True when the viewer is explicitly @-mentioned in unread history. */
  hasUnreadMention: z.boolean(),
  isMuted: z.boolean(),
  isPinned: z.boolean(),
  createdBy: idSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type Conversation = z.infer<typeof conversationSchema>;

/* ──────────────────────────────────────────────────────────────────────────────
 * Derived view models
 * ────────────────────────────────────────────────────────────────────────────*/

/** Who is typing where — broadcast as a replace-whole-set payload. */
export const typingStateSchema = z.object({
  conversationId: idSchema,
  userIds: z.array(idSchema),
});
export type TypingState = z.infer<typeof typingStateSchema>;

/** A read cursor moving forward for one member in one conversation. */
export const readReceiptSchema = z.object({
  conversationId: idSchema,
  userId: idSchema,
  lastReadAt: timestampSchema,
});
export type ReadReceipt = z.infer<typeof readReceiptSchema>;

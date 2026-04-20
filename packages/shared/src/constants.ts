/** Protocol and product-wide constants. Shared so limits never drift apart. */

/**
 * Wire protocol version. The client sends it in the Socket.IO handshake; the
 * server refuses connections it cannot speak, which keeps a stale installed
 * build from corrupting state after a breaking change.
 */
export const PROTOCOL_VERSION = 1;

export const LIMITS = {
  /** Maximum characters in a single message body. */
  messageBody: 4000,
  /** Maximum characters in a conversation topic. */
  conversationTopic: 280,
  /** Maximum characters in a display name. */
  displayName: 48,
  /** Maximum characters in a presence status line. */
  statusMessage: 96,
  /** Username: lowercase, 3–24 chars. */
  usernameMin: 3,
  usernameMax: 24,
  /** Password minimum length. */
  passwordMin: 8,
  passwordMax: 128,
  /** Attachments per message. */
  attachmentsPerMessage: 10,
  /** Upload ceiling in bytes (25 MiB). */
  attachmentBytes: 25 * 1024 * 1024,
  /** Page size for history queries. */
  messagePageSize: 50,
  messagePageSizeMax: 100,
  /** Distinct emoji reactions allowed on one message. */
  reactionsPerMessage: 20,
} as const;

export const TIMINGS = {
  /** A typing indicator expires this long after the last keystroke event. */
  typingTtlMs: 5_000,
  /** Client throttles `typing:start` to at most one per interval. */
  typingThrottleMs: 2_000,
  /** Heartbeat used to detect half-open sockets. */
  heartbeatIntervalMs: 25_000,
  /** Grace period before a disconnected member is marked offline. */
  presenceGraceMs: 10_000,
  /** Access token lifetime. */
  accessTokenTtlMs: 15 * 60 * 1000,
  /** Refresh token lifetime. */
  refreshTokenTtlMs: 30 * 24 * 60 * 60 * 1000,
  /** Window during which an author may still edit a message. */
  messageEditWindowMs: 24 * 60 * 60 * 1000,
} as const;

/** Reaction shortcuts surfaced in the hover toolbar, in display order. */
export const QUICK_REACTIONS = ['👍', '🎉', '🔥', '❤️', '😂', '👀', '🚀', '✅'] as const;

/** Accent colours a member can pick; drives their avatar ring and bubble tint. */
export const ACCENT_COLORS = [
  'indigo',
  'violet',
  'cyan',
  'emerald',
  'amber',
  'rose',
  'sky',
  'fuchsia',
] as const;

export type AccentColor = (typeof ACCENT_COLORS)[number];

/** Socket.IO namespace used for all chat traffic. */
export const SOCKET_NAMESPACE = '/chat';

/** Canonical error codes. The client maps these to human-readable copy. */
export const ERROR_CODES = {
  unauthorized: 'UNAUTHORIZED',
  forbidden: 'FORBIDDEN',
  notFound: 'NOT_FOUND',
  conflict: 'CONFLICT',
  validation: 'VALIDATION_FAILED',
  rateLimited: 'RATE_LIMITED',
  protocolMismatch: 'PROTOCOL_MISMATCH',
  payloadTooLarge: 'PAYLOAD_TOO_LARGE',
  internal: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

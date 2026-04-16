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

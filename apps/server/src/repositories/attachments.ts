import { createId, type Attachment } from '@pachat/shared';
import { getDb } from '../db/index.js';
import { toAttachment, type AttachmentRow } from './rows.js';

export interface CreateAttachmentInput {
  ownerId: string;
  name: string;
  mimeType: string;
  byteSize: number;
  /** Opaque on-disk directory name; never derived from the client filename. */
  storageKey: string;
  width?: number | null;
  height?: number | null;
}

/**
 * Records an upload. `message_id` stays NULL until the owning message is sent,
 * which is what allows a client to upload while the composer is still open.
 */
export function createAttachment(input: CreateAttachmentInput): Attachment {
  const now = Date.now();
  const id = createId(now);

  getDb()
    .prepare(
      `INSERT INTO attachments (
         id, message_id, owner_id, name, mime_type, byte_size, storage_key,
         width, height, created_at
       ) VALUES (
         @id, NULL, @ownerId, @name, @mimeType, @byteSize, @storageKey,
         @width, @height, @now
       )`,
    )
    .run({
      id,
      ownerId: input.ownerId,
      name: input.name,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      storageKey: input.storageKey,
      width: input.width ?? null,
      height: input.height ?? null,
      now,
    });

  const row = getDb().prepare('SELECT * FROM attachments WHERE id = ?').get(id) as AttachmentRow;
  return toAttachment(row);
}

export function findAttachmentRow(id: string): AttachmentRow | null {
  const row = getDb().prepare('SELECT * FROM attachments WHERE id = ?').get(id) as
    AttachmentRow | undefined;
  return row ?? null;
}

/** Resolves a storage key back to its row, for the download route. */
export function findByStorageKey(storageKey: string): AttachmentRow | null {
  const row = getDb().prepare('SELECT * FROM attachments WHERE storage_key = ?').get(storageKey) as
    AttachmentRow | undefined;
  return row ?? null;
}

/**
 * True when `userId` may download the attachment: they either uploaded it, or
 * they are a member of the conversation whose message carries it.
 */
export function canAccessAttachment(row: AttachmentRow, userId: string): boolean {
  if (row.owner_id === userId) return true;
  if (!row.message_id) return false;

  const hit = getDb()
    .prepare(
      `SELECT 1 AS ok
         FROM messages m
         JOIN conversation_members cm ON cm.conversation_id = m.conversation_id
        WHERE m.id = ? AND cm.user_id = ?`,
    )
    .get(row.message_id, userId) as { ok: number } | undefined;

  return Boolean(hit);
}

export function deleteAttachment(id: string): void {
  getDb().prepare('DELETE FROM attachments WHERE id = ?').run(id);
}

/** Total bytes a member has uploaded, for a per-account storage quota. */
export function bytesUploadedBy(userId: string): number {
  const row = getDb()
    .prepare('SELECT COALESCE(SUM(byte_size), 0) AS total FROM attachments WHERE owner_id = ?')
    .get(userId) as { total: number };
  return row.total;
}

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

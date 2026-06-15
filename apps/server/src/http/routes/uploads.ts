import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { createId, LIMITS, type UploadResponse } from '@pachat/shared';
import { env } from '../../config/env.js';
import { AppError, forbidden, notFound, unauthorized } from '../../lib/errors.js';
import { readImageSize } from '../../lib/image-size.js';
import { createLogger } from '../../lib/logger.js';
import * as attachments from '../../repositories/attachments.js';
import { requireAuth } from '../middleware.js';

const log = createLogger('uploads');

export const uploadRouter = Router();

/**
 * Files are buffered in memory and written by hand rather than streamed
 * straight to disk, because the storage key must be generated server-side and
 * the image header read before anything is persisted. At a 25 MiB ceiling the
 * memory cost is bounded and predictable.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: LIMITS.attachmentBytes,
    files: LIMITS.attachmentsPerMessage,
  },
});

/** Mime types rendered inline. Everything else downloads as an attachment. */
const INLINE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'text/plain',
  'application/pdf',
]);

/**
 * Characters forbidden in a Windows filename, plus ASCII control codes.
 *
 * The control-character range is the point of this pattern: a filename
 * containing a NUL or a newline can truncate a path or forge a response
 * header, so matching them is deliberate rather than accidental.
 */
// eslint-disable-next-line no-control-regex
const UNSAFE_NAME_CHARS = /[\u0000-\u001f<>:"|?*]/g;

/**
 * Sanitises a client-supplied filename.
 *
 * Only the basename is kept and path separators are stripped, so `../../` or
 * an absolute path in the upload cannot escape the storage directory. The name
 * is used solely for display and the Content-Disposition header — never to
 * build a path.
 */
function safeName(original: string): string {
  const base = basename(original).replace(/[/\\]/g, '').trim();
  const cleaned = base.replace(UNSAFE_NAME_CHARS, '').slice(0, 200).trim();
  return cleaned.length > 0 ? cleaned : `file${extname(base) || ''}`;
}

uploadRouter.post(
  '/',
  requireAuth,
  upload.array('files', LIMITS.attachmentsPerMessage),
  (req, res) => {
    if (!req.principal) throw unauthorized();
    const principal = req.principal;

    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      throw new AppError('VALIDATION_FAILED', 'No files were uploaded', {
        fields: { files: 'Required' },
      });
    }

    const created = files.map((file) => {
      // Each upload gets its own opaque directory. The on-disk layout is
      // therefore independent of the display name, so two files called
      // "screenshot.png" cannot collide and no client-supplied name is ever
      // interpreted as a path component.
      const storageKey = createId();
      const directory = join(env.uploadDir, storageKey);
      mkdirSync(directory, { recursive: true });

      const name = safeName(file.originalname);
      writeFileSync(join(directory, 'blob'), file.buffer);

      const dimensions = readImageSize(file.buffer, file.mimetype);

      return attachments.createAttachment({
        ownerId: principal.userId,
        name,
        mimeType: file.mimetype,
        byteSize: file.size,
        storageKey,
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
      });
    });

    log.info('files uploaded', {
      user: principal.username,
      count: created.length,
      bytes: files.reduce((sum, f) => sum + f.size, 0),
    });

    const payload: UploadResponse = { attachments: created };
    res.status(201).json(payload);
  },
);

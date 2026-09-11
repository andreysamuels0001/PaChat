import { useState } from 'react';
import { Download, FileText, Film, Music, Paperclip } from 'lucide-react';
import { clamp, formatBytes, type Attachment } from '@pachat/shared';
import { cn } from '@/lib/cn';
import { fileUrl } from '@/lib/api';
import { bridge } from '@/lib/bridge';
import { useSession } from '@/store/session-store';
import { Modal } from '@/components/ui/Overlay';

/**
 * Attachment rendering.
 *
 * Images are shown inline at their intrinsic aspect ratio — the server records
 * width and height at upload time, so the box is reserved before the bytes
 * arrive and the message list never reflows as pictures decode. Everything
 * else becomes a compact file row.
 */

const isImage = (attachment: Attachment): boolean =>
  attachment.mimeType.startsWith('image/') &&
  attachment.width !== null &&
  attachment.height !== null;

export function Attachments({ attachments }: { attachments: Attachment[] }) {
  const token = useSession((s) => s.accessToken);
  const [preview, setPreview] = useState<Attachment | null>(null);

  if (attachments.length === 0) return null;

  const images = attachments.filter(isImage);
  const files = attachments.filter((a) => !isImage(a));

  return (
    <>
      {images.length > 0 && (
        <div
          className={cn(
            'mt-2 grid gap-1.5',
            images.length === 1 ? 'max-w-md' : 'max-w-xl grid-cols-2',
          )}
        >
          {images.map((attachment) => (
            <ImageTile
              key={attachment.id}
              attachment={attachment}
              token={token}
              solo={images.length === 1}
              onOpen={() => setPreview(attachment)}
            />
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div className="mt-2 flex max-w-md flex-col gap-1.5">
          {files.map((attachment) => (
            <FileRow key={attachment.id} attachment={attachment} token={token} />
          ))}
        </div>
      )}

      <Modal open={preview !== null} onClose={() => setPreview(null)} bare width="max-w-5xl">
        {preview && (
          <div className="flex flex-col">
            <img
              src={fileUrl(preview.url, token)}
              alt={preview.name}
              className="max-h-[78vh] w-full object-contain"
            />
            <div className="flex items-center justify-between gap-4 px-4 py-3 hairline-t">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-ink">{preview.name}</p>
                <p className="text-[11.5px] text-ink-faint">
                  {preview.width}×{preview.height} · {formatBytes(preview.byteSize)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => bridge.shell.openExternal(fileUrl(preview.url, token))}
                className="shrink-0 text-[12.5px] font-medium text-accent-300 hover:underline"
              >
                Open original
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

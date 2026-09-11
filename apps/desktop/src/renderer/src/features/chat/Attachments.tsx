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

function ImageTile({
  attachment,
  token,
  solo,
  onOpen,
}: {
  attachment: Attachment;
  token: string | null;
  solo: boolean;
  onOpen: () => void;
}) {
  const [loaded, setLoaded] = useState(false);

  // Cap the reserved height so a tall screenshot cannot push the composer off
  // screen, while still honouring the real aspect ratio below that cap.
  const ratio = (attachment.width ?? 1) / (attachment.height ?? 1);
  const maxHeight = solo ? 360 : 200;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'group relative overflow-hidden rounded-lg border border-line-subtle bg-sunken',
        'transition-[border-color] duration-(--duration-fast) hover:border-line-strong',
      )}
      style={{
        aspectRatio: `${clamp(ratio, 0.5, 2.4)}`,
        maxHeight,
      }}
    >
      {!loaded && <span className="skeleton absolute inset-0" />}
      <img
        src={fileUrl(attachment.url, token)}
        alt={attachment.name}
        draggable={false}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={cn(
          'size-full object-cover transition-opacity duration-(--duration-base)',
          loaded ? 'opacity-100' : 'opacity-0',
        )}
      />
      <span
        className={cn(
          'absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t',
          'from-black/70 to-transparent px-2.5 pt-6 pb-2 text-[11px] text-white/90',
          'opacity-0 transition-opacity group-hover:opacity-100',
        )}
      >
        <span className="truncate">{attachment.name}</span>
        <span className="shrink-0 text-white/60">{formatBytes(attachment.byteSize)}</span>
      </span>
    </button>
  );
}

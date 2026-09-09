import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CornerUpLeft, Paperclip, SendHorizontal, Smile, X } from 'lucide-react';
import {
  formatBytes,
  LIMITS,
  QUICK_REACTIONS,
  truncate,
  type Attachment,
  type Conversation,
} from '@pachat/shared';
import { cn } from '@/lib/cn';
import { api } from '@/lib/api';
import { useAutoResize } from '@/lib/hooks';
import { IconButton } from '@/components/ui/Button';
import { Popover } from '@/components/ui/Overlay';
import { Tooltip } from '@/components/ui/Controls';
import { Spinner } from '@/components/ui/Feedback';
import { useChat } from '@/store/chat-store';
import { useSession } from '@/store/session-store';
import { useUi } from '@/store/ui-store';
import { pingTyping, sendMessage, titleOf } from '@/store/realtime';

/**
 * The message composer.
 *
 * Draft text is held per conversation in the store rather than in local state,
 * so switching channels mid-sentence and coming back preserves exactly what
 * was typed. Attachments are uploaded immediately on selection and held as
 * ids, which means the send itself is a small JSON frame regardless of how
 * large the files are.
 */
export function Composer({ conversation }: { conversation: Conversation }) {
  const draft = useChat((s) => s.drafts.get(conversation.id) ?? '');
  const setDraft = useChat((s) => s.setDraft);
  const self = useSession((s) => s.self);
  const token = useSession((s) => s.accessToken);
  const replyTo = useUi((s) => s.replyTo);
  const setReplyTo = useUi((s) => s.setReplyTo);
  const toast = useUi((s) => s.toast);
  const users = useChat((s) => s.users);

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState<number | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useAutoResize(textareaRef, draft);

  // Focus the composer when the conversation changes, and clear per-thread
  // state that should not leak across conversations.
  useEffect(() => {
    setAttachments([]);
    textareaRef.current?.focus();
  }, [conversation.id]);

  // A reply is always to a message in the current conversation; discard a
  // stale target if the viewer navigated away.
  const activeReply = replyTo && replyTo.conversationId === conversation.id ? replyTo : null;

  const enterToSend = self?.preferences.enterToSend ?? true;
  const canSend = draft.trim().length > 0 || attachments.length > 0;
  const remaining = LIMITS.messageBody - draft.length;

  const submit = useCallback((): void => {
    if (!canSend) return;
    void sendMessage({
      conversationId: conversation.id,
      body: draft,
      attachments,
      replyToId: activeReply?.id ?? null,
    });
    setAttachments([]);
    pingTyping(conversation.id, false);
    // Reset the measured height immediately; waiting for the store round-trip
    // leaves a multi-line box briefly empty.
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [canSend, conversation.id, draft, attachments, activeReply]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Escape' && activeReply) {
      event.preventDefault();
      setReplyTo(null);
      return;
    }

    const isSendCombo = enterToSend
      ? event.key === 'Enter' && !event.shiftKey
      : event.key === 'Enter' && (event.metaKey || event.ctrlKey);

    if (isSendCombo) {
      event.preventDefault();
      submit();
    }
  };

  const upload = useCallback(
    async (files: File[]): Promise<void> => {
      if (!token || files.length === 0) return;

      const tooBig = files.filter((file) => file.size > LIMITS.attachmentBytes);
      if (tooBig.length > 0) {
        toast({
          tone: 'warning',
          title: 'File too large',
          description: `${tooBig[0]!.name} exceeds ${formatBytes(LIMITS.attachmentBytes)}.`,
        });
        return;
      }

      if (attachments.length + files.length > LIMITS.attachmentsPerMessage) {
        toast({
          tone: 'warning',
          title: 'Too many attachments',
          description: `Up to ${LIMITS.attachmentsPerMessage} files per message.`,
        });
        return;
      }

      setUploading(0);
      try {
        const result = await api.upload(files, token, (fraction) => setUploading(fraction));
        setAttachments((current) => [...current, ...result.attachments]);
      } catch (error) {
        toast({
          tone: 'danger',
          title: 'Upload failed',
          description: error instanceof Error ? error.message : undefined,
        });
      } finally {
        setUploading(null);
      }
    },
    [token, attachments.length, toast],
  );

  /** Pasting an image straight into the composer uploads it. */
  const onPaste = (event: React.ClipboardEvent): void => {
    const files = [...event.clipboardData.files];
    if (files.length === 0) return;
    event.preventDefault();
    void upload(files);
  };

  const peerName =
    conversation.kind === 'direct'
      ? titleOf(conversation)
      : `#${conversation.name ?? titleOf(conversation)}`;

  return (
    <div className="shrink-0 px-6 pb-5">
      {/* Reply context sits above the input, attached to it, so the
          relationship is unambiguous. */}
      <AnimatePresence>
        {activeReply && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.14 }}
            className={cn(
              'flex items-center gap-2 rounded-t-lg border border-b-0 border-line',
              'bg-raised/80 px-3 py-2 text-[12px]',
            )}
          >
            <CornerUpLeft className="size-3.5 shrink-0 text-ink-dim" />
            <span className="shrink-0 text-ink-dim">Replying to</span>
            <span className="shrink-0 font-medium text-ink-muted">
              {users.get(activeReply.authorId)?.displayName ?? 'someone'}
            </span>
            <span className="min-w-0 flex-1 truncate text-ink-faint">
              {truncate(activeReply.body, 80)}
            </span>
            <IconButton label="Cancel reply" size="xs" onClick={() => setReplyTo(null)}>
              <X />
            </IconButton>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void upload([...event.dataTransfer.files]);
        }}
        className={cn(
          'relative rounded-lg border bg-raised/70 transition-[border-color,box-shadow]',
          'duration-(--duration-fast) ease-(--ease-smooth)',
          activeReply && 'rounded-t-none',
          dragging
            ? 'border-accent-500 shadow-[0_0_0_3px_color-mix(in_oklab,var(--c-accent-500)_18%,transparent)]'
            : 'border-line focus-within:border-accent-500/55',
        )}
      >
        {dragging && (
          <div
            className={cn(
              'pointer-events-none absolute inset-0 z-10 flex items-center justify-center',
              'rounded-lg bg-accent-500/10 text-[13px] font-medium text-accent-200',
            )}
          >
            Drop files to attach
          </div>
        )}

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pt-3">
            {attachments.map((attachment) => (
              <AttachmentChip
                key={attachment.id}
                attachment={attachment}
                onRemove={() =>
                  setAttachments((current) => current.filter((a) => a.id !== attachment.id))
                }
              />
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={draft}
          rows={1}
          maxLength={LIMITS.messageBody}
          placeholder={`Message ${peerName}`}
          onChange={(event) => {
            setDraft(conversation.id, event.target.value);
            pingTyping(conversation.id, event.target.value.trim().length > 0);
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={() => pingTyping(conversation.id, false)}
          className={cn(
            'scroll-area block max-h-[220px] w-full resize-none bg-transparent px-3.5 py-3',
            'text-[13.5px] leading-[1.55] text-ink outline-none selectable',
            'placeholder:text-ink-faint',
          )}
        />

        <div className="flex items-center gap-1 px-2 pb-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              void upload([...(event.target.files ?? [])]);
              event.target.value = '';
            }}
          />

          <Tooltip content="Attach files">
            <IconButton
              label="Attach files"
              disabled={uploading !== null}
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip />
            </IconButton>
          </Tooltip>

          <span className="relative inline-flex">
            <Tooltip content="Emoji">
              <IconButton label="Emoji" active={emojiOpen} onClick={() => setEmojiOpen((v) => !v)}>
                <Smile />
              </IconButton>
            </Tooltip>

            <Popover open={emojiOpen} onClose={() => setEmojiOpen(false)} align="start" side="top">
              <div className="flex w-56 flex-wrap gap-0.5 p-1.5">
                {EMOJI.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      setDraft(conversation.id, `${draft}${emoji}`);
                      setEmojiOpen(false);
                      textareaRef.current?.focus();
                    }}
                    className="flex size-8 items-center justify-center rounded-sm text-[17px] hover:bg-hover"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </Popover>
          </span>

          {uploading !== null && (
            <span className="ml-1 flex items-center gap-1.5 text-[11.5px] text-ink-dim">
              <Spinner className="size-3" />
              {Math.round(uploading * 100)}%
            </span>
          )}

          <span className="flex-1" />

          {/* Surface the character budget only when it starts to matter. */}
          {remaining < 240 && (
            <span
              className={cn(
                'mr-1 text-[11px] tabular-nums',
                remaining < 40 ? 'text-danger' : 'text-ink-faint',
              )}
            >
              {remaining}
            </span>
          )}

          <span className="mr-1 hidden text-[11px] text-ink-faint sm:inline">
            {enterToSend ? 'Enter to send' : 'Ctrl+Enter to send'}
          </span>

          <IconButton
            label="Send message"
            variant={canSend ? 'primary' : 'ghost'}
            size="md"
            disabled={!canSend || uploading !== null}
            onClick={submit}
          >
            <SendHorizontal />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

/** A compact chip for a staged, not-yet-sent attachment. */
function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: Attachment;
  onRemove: () => void;
}) {
  return (
    <span
      className={cn(
        'flex items-center gap-2 rounded-md border border-line bg-sunken/70 py-1 pr-1 pl-2.5',
        'text-[11.5px] text-ink-muted',
      )}
    >
      <span className="max-w-40 truncate">{attachment.name}</span>
      <span className="shrink-0 text-ink-faint">{formatBytes(attachment.byteSize)}</span>
      <IconButton label={`Remove ${attachment.name}`} size="xs" onClick={onRemove}>
        <X />
      </IconButton>
    </span>
  );
}

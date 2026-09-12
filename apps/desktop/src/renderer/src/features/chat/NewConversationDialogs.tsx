import { useEffect, useMemo, useState } from 'react';
import { Check, Hash, Lock, Search } from 'lucide-react';
import { LIMITS, type User } from '@pachat/shared';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Overlay';
import { TextField } from '@/components/ui/Field';
import { Switch } from '@/components/ui/Controls';
import { Avatar } from '@/components/ui/Avatar';
import { Spinner } from '@/components/ui/Feedback';
import { useChat } from '@/store/chat-store';
import { useSession } from '@/store/session-store';
import { useUi } from '@/store/ui-store';
import { createChannel, loadDirectory, openDirectMessage } from '@/store/realtime';

/* ──────────────────────────────────────────────────────── new channel ─────*/

const CHANNEL_ICONS = ['🌐', '⚙️', '🎨', '🚀', '📣', '🧪', '📈', '🐛', '💡', '🎯', '🔒', '☕'];

/**
 * Channel creation.
 *
 * The name is slugified live so the preview shows exactly what will be created
 * — typing "Design Review" and getting `#design-review` should never be a
 * surprise discovered after submitting.
 */
export function NewChannelDialog() {
  const open = useUi((s) => s.overlay === 'new-channel');
  const close = useUi((s) => s.closeOverlay);

  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [icon, setIcon] = useState<string | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName('');
    setTopic('');
    setIcon(null);
    setIsPrivate(false);
    setInvited(new Set());
  }, [open]);

  const slug = useMemo(
    () =>
      name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 64),
    [name],
  );

  const submit = async (): Promise<void> => {
    if (slug.length === 0 || busy) return;
    setBusy(true);
    const created = await createChannel({
      name: slug,
      topic: topic.trim() || null,
      icon,
      isPrivate,
      memberIds: [...invited],
    });
    setBusy(false);
    if (created) close();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Create a channel"
      description="Channels are where a team keeps a topic in one place."
      width="max-w-xl"
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={slug.length === 0} onClick={submit}>
            Create channel
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          data-autofocus
          label="Name"
          value={name}
          maxLength={64}
          onChange={(event) => setName(event.target.value)}
          placeholder="design-review"
          icon={isPrivate ? <Lock /> : <Hash />}
          hint={slug.length > 0 ? `Will be created as #${slug}` : 'Letters, digits and dashes.'}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void submit();
          }}
        />

        <TextField
          label="Topic"
          value={topic}
          maxLength={LIMITS.conversationTopic}
          onChange={(event) => setTopic(event.target.value)}
          placeholder="What is this channel for?"
          hint="Shown in the header so new members know where they are."
        />

        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-medium tracking-wide text-ink-muted">Icon</span>
          <div className="flex flex-wrap gap-1">
            {CHANNEL_ICONS.map((candidate) => (
              <button
                key={candidate}
                type="button"
                onClick={() => setIcon(icon === candidate ? null : candidate)}
                className={cn(
                  'flex size-9 items-center justify-center rounded-md border text-[17px]',
                  'transition-colors duration-(--duration-fast)',
                  icon === candidate
                    ? 'border-accent-500/55 bg-accent-500/15'
                    : 'border-line hover:border-line-strong hover:bg-hover',
                )}
              >
                {candidate}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-start justify-between gap-6 rounded-md border border-line-subtle bg-sunken/50 px-3 py-2.5">
          <div>
            <p className="text-[13px] font-medium text-ink">Private channel</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-ink-dim">
              Only invited members can find or read it.
            </p>
          </div>
          <Switch checked={isPrivate} onChange={setIsPrivate} label="Private channel" />
        </div>

        <MemberPicker
          selected={invited}
          onToggle={(id) =>
            setInvited((current) => {
              const next = new Set(current);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
        />
      </div>
    </Modal>
  );
}

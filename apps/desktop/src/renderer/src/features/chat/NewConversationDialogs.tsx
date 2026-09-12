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

/* ───────────────────────────────────────────────────────── new direct ─────*/

export function NewDirectDialog() {
  const open = useUi((s) => s.overlay === 'new-direct');
  const close = useUi((s) => s.closeOverlay);
  const [query, setQuery] = useState('');
  const { users, loading } = useDirectory(open);
  const selfId = useSession((s) => s.self?.id);

  const needle = query.trim().toLowerCase();
  const matches = users.filter(
    (user) =>
      user.id !== selfId &&
      (needle.length === 0 ||
        user.displayName.toLowerCase().includes(needle) ||
        user.username.includes(needle)),
  );

  return (
    <Modal
      open={open}
      onClose={close}
      title="New message"
      description="Pick someone to start a direct conversation with."
      width="max-w-md"
    >
      <TextField
        data-autofocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search members"
        icon={<Search />}
      />

      <div className="scroll-area mt-3 max-h-80 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        ) : matches.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-ink-faint">No members match that.</p>
        ) : (
          <div className="flex flex-col gap-px">
            {matches.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => {
                  void openDirectMessage(user.id);
                  close();
                }}
                className="flex items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-hover/70"
              >
                <Avatar user={user} size="md" showPresence />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-ink">
                    {user.displayName}
                  </span>
                  <span className="block truncate text-[11.5px] text-ink-faint">
                    {user.title ?? `@${user.username}`}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ─────────────────────────────────────────────────────────── shared bits ──*/

/** Loads the member directory once per dialog opening. */
function useDirectory(open: boolean): { users: User[]; loading: boolean } {
  const cached = useChat((s) => s.users);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void loadDirectory().finally(() => setLoading(false));
  }, [open]);

  const users = useMemo(
    () => [...cached.values()].sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [cached],
  );

  return { users, loading: loading && users.length === 0 };
}

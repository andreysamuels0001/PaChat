import { useState } from 'react';
import { Bell, Monitor, Moon, Palette, Sun, User as UserIcon } from 'lucide-react';
import { ACCENT_COLORS, LIMITS, type AccentColor } from '@pachat/shared';
import { cn } from '@/lib/cn';
import { Modal } from '@/components/ui/Overlay';
import { Button } from '@/components/ui/Button';
import { TextField, FieldGroup, SettingRow } from '@/components/ui/Field';
import { Segmented, Switch } from '@/components/ui/Controls';
import { Avatar } from '@/components/ui/Avatar';
import { bridge } from '@/lib/bridge';
import { useSession } from '@/store/session-store';
import { useUi } from '@/store/ui-store';
import { updatePreferences, updateProfile } from '@/store/realtime';

/**
 * Settings.
 *
 * Preferences are stored server-side rather than locally, so they follow the
 * account to any machine. Each toggle applies optimistically — a theme switch
 * that waits for a round-trip feels broken even when the round-trip is fast.
 */

type Tab = 'profile' | 'appearance' | 'notifications';

const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: 'profile', label: 'Profile', icon: <UserIcon /> },
  { id: 'appearance', label: 'Appearance', icon: <Palette /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell /> },
];

export function SettingsDialog() {
  const open = useUi((s) => s.overlay === 'settings');
  const close = useUi((s) => s.closeOverlay);
  const [tab, setTab] = useState<Tab>('profile');

  return (
    <Modal open={open} onClose={close} title="Settings" width="max-w-2xl">
      <div className="flex min-h-[26rem] gap-5">
        <nav className="flex w-40 shrink-0 flex-col gap-0.5" aria-label="Settings sections">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              aria-current={tab === item.id ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px]',
                'transition-colors duration-(--duration-fast) [&>span>svg]:size-4',
                tab === item.id
                  ? 'bg-accent-500/14 font-medium text-ink'
                  : 'text-ink-muted hover:bg-hover/70 hover:text-ink',
              )}
            >
              <span className="shrink-0 text-ink-dim">{item.icon}</span>
              {item.label}
            </button>
          ))}

          <div className="mt-auto px-2.5 pt-4">
            <p className="text-[11px] text-ink-faint">PaChat {bridge.info.version}</p>
            <p className="text-[11px] text-ink-faint">{bridge.info.platform}</p>
          </div>
        </nav>

        <div className="scroll-area min-w-0 flex-1 overflow-y-auto pr-1">
          {tab === 'profile' && <ProfileTab />}
          {tab === 'appearance' && <AppearanceTab />}
          {tab === 'notifications' && <NotificationsTab />}
        </div>
      </div>
    </Modal>
  );
}

/* ─────────────────────────────────────────────────────────────── profile ───*/

function ProfileTab() {
  const self = useSession((s) => s.self);
  const [displayName, setDisplayName] = useState(self?.displayName ?? '');
  const [title, setTitle] = useState(self?.title ?? '');
  const [accent, setAccent] = useState<AccentColor>(self?.accentColor ?? 'indigo');
  const [saving, setSaving] = useState(false);

  if (!self) return null;

  const dirty =
    displayName.trim() !== self.displayName ||
    (title.trim() || null) !== self.title ||
    accent !== self.accentColor;

  const save = async (): Promise<void> => {
    setSaving(true);
    await updateProfile({
      displayName: displayName.trim(),
      title: title.trim() || null,
      accentColor: accent,
    });
    setSaving(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <FieldGroup title="Identity" description="How you appear to everyone else in the workspace.">
        <div className="flex items-center gap-4 rounded-lg border border-line-subtle bg-sunken/40 p-4">
          <Avatar
            user={{
              displayName: displayName || self.displayName,
              avatarUrl: self.avatarUrl,
              accentColor: accent,
            }}
            size="xl"
          />
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-ink">{displayName || self.displayName}</p>
            <p className="text-[12.5px] text-ink-dim">@{self.username}</p>
            {title.trim() && <p className="mt-0.5 text-[12px] text-ink-faint">{title}</p>}
          </div>
        </div>

        <TextField
          label="Display name"
          value={displayName}
          maxLength={LIMITS.displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />

        <TextField
          label="Title"
          value={title}
          maxLength={64}
          placeholder="Staff Engineer"
          hint="Optional. Shown beside your name and in the member list."
          onChange={(event) => setTitle(event.target.value)}
        />

        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-medium tracking-wide text-ink-muted">
            Accent colour
          </span>
          <div className="flex flex-wrap gap-2">
            {ACCENT_COLORS.map((colour) => (
              <button
                key={colour}
                type="button"
                aria-label={colour}
                onClick={() => setAccent(colour)}
                className={cn(
                  'size-7 rounded-full transition-transform duration-(--duration-fast)',
                  'ring-offset-2 ring-offset-[var(--c-raised)] hover:scale-110',
                  accent === colour && 'ring-2 ring-ink',
                )}
                style={{ background: `var(--c-user-${colour})` }}
              />
            ))}
          </div>
          <p className="text-[12px] text-ink-faint">
            Used for your avatar, your name in messages, and the spine on your replies.
          </p>
        </div>
      </FieldGroup>

      <div className="flex items-center justify-between gap-4 pt-1 hairline-t">
        <p className="pt-4 text-[12px] text-ink-faint">{self.email}</p>
        <Button
          variant="primary"
          disabled={!dirty}
          loading={saving}
          onClick={save}
          className="mt-4"
        >
          Save changes
        </Button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── appearance ───*/

function AppearanceTab() {
  const self = useSession((s) => s.self);
  const theme = useUi((s) => s.theme);
  const compact = useUi((s) => s.compact);
  const reduceMotion = useUi((s) => s.reduceMotion);

  if (!self) return null;

  return (
    <div className="flex flex-col gap-6">
      <FieldGroup title="Theme">
        <SettingRow
          title="Colour scheme"
          description="System follows your operating system setting."
          control={
            <Segmented
              value={theme}
              onChange={(next) => void updatePreferences({ theme: next })}
              options={[
                { value: 'dark', label: 'Dark', icon: <Moon /> },
                { value: 'light', label: 'Light', icon: <Sun /> },
                { value: 'system', label: 'System', icon: <Monitor /> },
              ]}
            />
          }
        />
      </FieldGroup>

      <FieldGroup title="Density and motion">
        <SettingRow
          title="Compact messages"
          description="Tightens vertical spacing so more of the conversation fits on screen."
          control={
            <Switch
              checked={compact}
              label="Compact messages"
              onChange={(next) => void updatePreferences({ compactDensity: next })}
            />
          }
        />

        <SettingRow
          title="Reduce motion"
          description="Disables transitions and the animated background. Your system setting is honoured automatically."
          control={
            <Switch
              checked={reduceMotion}
              label="Reduce motion"
              onChange={(next) => void updatePreferences({ reduceMotion: next })}
            />
          }
        />
      </FieldGroup>

      <FieldGroup title="Composer">
        <SettingRow
          title="Enter sends the message"
          description={
            self.preferences.enterToSend
              ? 'Shift+Enter inserts a line break.'
              : 'Ctrl+Enter sends; Enter inserts a line break.'
          }
          control={
            <Switch
              checked={self.preferences.enterToSend}
              label="Enter sends the message"
              onChange={(next) => void updatePreferences({ enterToSend: next })}
            />
          }
        />
      </FieldGroup>
    </div>
  );
}

/* ───────────────────────────────────────────────────────── notifications ───*/

function NotificationsTab() {
  const self = useSession((s) => s.self);
  if (!self) return null;

  return (
    <div className="flex flex-col gap-6">
      <FieldGroup
        title="Desktop notifications"
        description="Only unmuted conversations notify, and never while you are reading them in a focused window."
      >
        <SettingRow
          title="Show notifications"
          control={
            <Switch
              checked={self.preferences.desktopNotifications}
              label="Show notifications"
              onChange={(next) => void updatePreferences({ desktopNotifications: next })}
            />
          }
        />

        <SettingRow
          title="Play a sound"
          description="Uses your system notification sound."
          control={
            <Switch
              checked={self.preferences.notificationSound}
              disabled={!self.preferences.desktopNotifications}
              label="Play a sound"
              onChange={(next) => void updatePreferences({ notificationSound: next })}
            />
          }
        />
      </FieldGroup>

      <FieldGroup title="Privacy">
        <SettingRow
          title="Share read receipts"
          description="Lets others see when you have caught up. Turning this off also hides theirs from you."
          control={
            <Switch
              checked={self.preferences.showReadReceipts}
              label="Share read receipts"
              onChange={(next) => void updatePreferences({ showReadReceipts: next })}
            />
          }
        />
      </FieldGroup>
    </div>
  );
}

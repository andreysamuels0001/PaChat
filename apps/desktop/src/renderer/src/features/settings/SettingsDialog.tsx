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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app, screen, type BrowserWindow, type Rectangle } from 'electron';

/**
 * Remembers window geometry between launches.
 *
 * The saved rectangle is validated against the *current* display layout before
 * it is used: unplugging the external monitor an app was last maximised on is
 * the classic way to end up with a window restored entirely off-screen.
 */

interface Persisted {
  bounds: Rectangle;
  isMaximised: boolean;
}

const DEFAULT_BOUNDS: Rectangle = { x: 0, y: 0, width: 1280, height: 840 };
const MIN_VISIBLE = 80;

function statePath(): string {
  return join(app.getPath('userData'), 'window-state.json');
}

function read(): Persisted | null {
  try {
    const path = statePath();
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8')) as Persisted;
  } catch {
    return null;
  }
}

/** True when a meaningful part of `bounds` lands on some connected display. */
function isVisibleSomewhere(bounds: Rectangle): boolean {
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea;
    const overlapX =
      Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x);
    const overlapY =
      Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y);
    return overlapX > MIN_VISIBLE && overlapY > MIN_VISIBLE;
  });
}

export function restoredBounds(): { bounds: Rectangle; isMaximised: boolean } {
  const saved = read();
  if (!saved?.bounds || !isVisibleSomewhere(saved.bounds)) {
    // Centre the default on the primary display rather than pinning to 0,0.
    const { workArea } = screen.getPrimaryDisplay();
    const width = Math.min(DEFAULT_BOUNDS.width, workArea.width - 80);
    const height = Math.min(DEFAULT_BOUNDS.height, workArea.height - 80);
    return {
      bounds: {
        width,
        height,
        x: Math.round(workArea.x + (workArea.width - width) / 2),
        y: Math.round(workArea.y + (workArea.height - height) / 2),
      },
      isMaximised: false,
    };
  }
  return { bounds: saved.bounds, isMaximised: saved.isMaximised };
}

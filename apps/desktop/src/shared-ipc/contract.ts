/**
 * The IPC contract between the Electron main process and the renderer.
 *
 * The renderer runs with `contextIsolation: true` and `nodeIntegration: false`,
 * so it has no filesystem, no `require` and no direct Electron access. Every
 * privileged capability it has is one of the named channels below, exposed
 * through the preload bridge. Adding a capability therefore means adding it
 * here first — which keeps the privileged surface small and reviewable.
 */

export const IPC = {
  /* Window chrome — the frame is drawn in React, so the buttons need these. */
  windowMinimise: 'window:minimise',
  windowToggleMaximise: 'window:toggle-maximise',
  windowClose: 'window:close',
  windowState: 'window:state',

  /* Environment the renderer cannot read for itself. */
  appInfo: 'app:info',
  appFocusChanged: 'app:focus-changed',

  /* OS-encrypted credential storage for the refresh token. */
  secretSet: 'secret:set',
  secretGet: 'secret:get',
  secretDelete: 'secret:delete',

  /* Native notifications and the taskbar / dock badge. */
  notify: 'notify:show',
  notifyActivated: 'notify:activated',
  badgeSet: 'badge:set',

  /* Native theme, so the window frame matches the in-app theme. */
  themeSet: 'theme:set',

  /* Open a link in the user's browser rather than inside the app. */
  openExternal: 'shell:open-external',

  /* Global accelerators forwarded from the application menu. */
  menuCommand: 'menu:command',
} as const;

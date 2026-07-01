import { app, Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { IPC, type MenuCommand } from '../shared-ipc/contract.js';
import { openExternally } from './window.js';

const REPOSITORY = 'https://github.com/andreysamuels0001/pachat';

/**
 * The application menu.
 *
 * On macOS a menu bar is mandatory — without one the standard Cmd+C / Cmd+Q
 * accelerators simply do not work, because they are menu-driven rather than
 * handled by the web contents. On Windows and Linux the bar is auto-hidden
 * (Alt reveals it) so the custom titlebar stays visually clean while the
 * shortcuts still resolve.
 */
export function installApplicationMenu(window: BrowserWindow): void {
  const isMac = process.platform === 'darwin';

  const send = (command: MenuCommand) => (): void => {
    if (!window.isDestroyed()) window.webContents.send(IPC.menuCommand, command);
  };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { label: 'Settings…', accelerator: 'Cmd+,', click: send('open-settings') },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ] satisfies MenuItemConstructorOptions[])
      : []),

    {
      label: '&File',
      submenu: [
        {
          label: 'New Channel…',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: send('new-channel'),
        },
        {
          label: 'Search…',
          accelerator: 'CmdOrCtrl+K',
          click: send('open-command-palette'),
        },
        { type: 'separator' },
        ...(isMac
          ? []
          : ([
              { label: 'Settings…', accelerator: 'Ctrl+,', click: send('open-settings') },
              { type: 'separator' },
              { role: 'quit', label: 'Exit' },
            ] satisfies MenuItemConstructorOptions[])),
      ],
    },

    {
      label: '&Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },

    {
      label: '&View',
      submenu: [
        {
          label: 'Next Conversation',
          accelerator: 'CmdOrCtrl+Alt+Down',
          click: send('next-conversation'),
        },
        {
          label: 'Previous Conversation',
          accelerator: 'CmdOrCtrl+Alt+Up',
          click: send('previous-conversation'),
        },
        { type: 'separator' },
        {
          label: 'Toggle Member List',
          accelerator: 'CmdOrCtrl+Shift+M',
          click: send('toggle-members'),
        },
        {
          label: 'Mark All As Read',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: send('mark-all-read'),
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        // Kept in production too: a user reporting a rendering bug can be
        // asked for the console output without a special build.
        { role: 'toggleDevTools' },
      ],
    },

    {
      label: '&Help',
      submenu: [
        {
          label: 'Documentation',
          click: () => void openExternally(`${REPOSITORY}#readme`),
        },
        {
          label: 'Report an Issue',
          click: () => void openExternally(`${REPOSITORY}/issues/new/choose`),
        },
        { type: 'separator' },
        { label: `PaChat ${app.getVersion()}`, enabled: false },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

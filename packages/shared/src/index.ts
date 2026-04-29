/**
 * @pachat/shared — the contract layer.
 *
 * Everything that crosses the wire between the Electron client and the realtime
 * server is declared exactly once, here. The server validates inbound payloads
 * against these schemas; the client derives its TypeScript types from them. A
 * breaking protocol change therefore cannot compile on only one side.
 */

export * from './constants.js';
export * from './domain.js';
export * from './events.js';
export * from './http.js';
export * from './utils.js';

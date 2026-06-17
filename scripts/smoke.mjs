#!/usr/bin/env node
/**
 * End-to-end smoke test against a running gateway.
 *
 *   npm run dev:server        # in one terminal
 *   npm run test:e2e          # in another
 *
 * Drives two live socket clients through the full path a real desktop client
 * takes — REST auth and token rotation, handshake rejection, the bootstrap
 * frame, history hydration, an idempotent duplicate send, reactions, edit
 * authorisation, typing fan-out, read receipts, FTS5 search, channel and
 * direct-message creation, preferences, presence and payload validation.
 *
 * It asserts against the *protocol*, not against internals, so it is the
 * fastest way to confirm a change has not broken the contract. Run
 * `npm run db:reset` afterwards to discard the data it creates.
 */
import { io } from 'socket.io-client';

const BASE = 'http://127.0.0.1:4000';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const post = async (path, body) => {
  const response = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(`${BASE}/chat`, {
      transports: ['websocket'],
      auth: {
        token,
        protocolVersion: 1,
        client: { name: 'smoke', version: '1.0.0', platform: 'node' },
      },
    });
    const timer = setTimeout(() => reject(new Error('handshake timeout')), 8000);
    socket.on('session:ready', (payload) => {
      clearTimeout(timer);
      resolve({ socket, ready: payload });
    });
    socket.on('connect_error', (error) => {
      clearTimeout(timer);
      reject(new Error(`connect_error: ${error.message}`));
    });
  });
}

const request = (socket, event, payload) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 8000);
    const handle = (result) => {
      clearTimeout(timer);
      if (result?.ok) resolve(result.data);
      else reject(new Error(`${event}: ${result?.error?.code} ${result?.error?.message}`));
    };
    if (payload === undefined) socket.emit(event, handle);
    else socket.emit(event, payload, handle);
  });

const waitFor = (socket, event, predicate = () => true, ms = 6000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} never arrived`)), ms);
    const listener = (payload) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, listener);
      resolve(payload);
    };
    socket.on(event, listener);
  });

async function main() {
  // ── REST ──────────────────────────────────────────────────────────────────
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  check('GET /api/health', health.status === 'ok', `schema v${health.schemaVersion}`);

  const bad = await post('/api/auth/login', { identifier: 'ada@pachat.app', password: 'wrongpass' });
  check('login rejects a wrong password', bad.status === 401, bad.body?.error?.code);

  const ada = await post('/api/auth/login', { identifier: 'ada@pachat.app', password: 'pachat123' });
  check('login succeeds', ada.status === 200 && !!ada.body?.tokens?.accessToken, ada.body?.self?.displayName);

  const grace = await post('/api/auth/login', { identifier: 'grace', password: 'pachat123' });
  check('login by username', grace.status === 200, grace.body?.self?.displayName);

  const refreshed = await post('/api/auth/refresh', { refreshToken: ada.body.tokens.refreshToken });
  check('refresh rotates the token',
    refreshed.status === 200 && refreshed.body.tokens.refreshToken !== ada.body.tokens.refreshToken);

  const replay = await post('/api/auth/refresh', { refreshToken: ada.body.tokens.refreshToken });
  check('the old refresh token is dead after rotation', replay.status === 401, replay.body?.error?.code);

  const unauth = await fetch(`${BASE}/api/auth/me`).then((r) => r.status);
  check('GET /api/auth/me requires a token', unauth === 401);

  const adaToken = refreshed.body.tokens.accessToken;

  // ── Handshake rejection ───────────────────────────────────────────────────
  await connect('not-a-real-token')
    .then(() => check('socket rejects a bogus token', false, 'it connected'))
    .catch((error) => check('socket rejects a bogus token', true, error.message.slice(0, 48)));

  // ── Two live clients ──────────────────────────────────────────────────────
  const a = await connect(adaToken);
  check('session:ready bootstrap',
    a.ready.conversations.length > 0 && a.ready.users.length > 0,
    `${a.ready.conversations.length} conversations, ${a.ready.users.length} users`);

  const b = await connect(grace.body.tokens.accessToken);
  check('second client connects', !!b.ready.self, b.ready.self.displayName);

  const general = a.ready.conversations.find((c) => c.name === 'engineering');
  check('seeded #engineering is present', !!general);

  const page = await request(a.socket, 'conversation:open', { conversationId: general.id });
  check('conversation:open returns history', page.messages.length > 0, `${page.messages.length} messages`);

  const grouped = page.messages.some((m) => m.reactions.length > 0);
  check('reactions hydrate with history', grouped);

  const withReply = page.messages.find((m) => m.replyTo !== null);
  check('reply previews hydrate', !!withReply, withReply?.replyTo?.excerpt?.slice(0, 32));

  // ── Send + fan-out ────────────────────────────────────────────────────────
  const nonce = `n_smoke_${Date.now()}`;
  const fanout = waitFor(b.socket, 'message:created', (p) => p.message.nonce !== undefined || true);
  const sent = await request(a.socket, 'message:send', {
    conversationId: general.id,
    nonce,
    body: 'Smoke test: **bold**, `code`, @grace and https://example.com',
  });
  check('message:send acknowledges', !!sent.message.id, sent.message.id);

  const received = await fanout;
  check('peer receives message:created', received.message.id === sent.message.id);

  const retry = await request(a.socket, 'message:send', {
    conversationId: general.id,
    nonce,
    body: 'Smoke test: **bold**, `code`, @grace and https://example.com',
  });
  check('duplicate nonce is deduplicated', retry.message.id === sent.message.id, 'same id returned');

  // ── Reactions ─────────────────────────────────────────────────────────────
  const reacted = await request(b.socket, 'message:react', { messageId: sent.message.id, emoji: '🔥' });
  check('reaction added', reacted.message.reactions.some((r) => r.emoji === '🔥' && r.count === 1));

  const unreacted = await request(b.socket, 'message:react', { messageId: sent.message.id, emoji: '🔥' });
  check('reaction toggles off', !unreacted.message.reactions.some((r) => r.emoji === '🔥'));

  // ── Edit, delete ──────────────────────────────────────────────────────────
  const edited = await request(a.socket, 'message:edit', {
    messageId: sent.message.id,
    body: 'Smoke test edited',
  });
  check('message:edit sets editedAt', edited.message.editedAt !== null);

  await request(b.socket, 'message:edit', { messageId: sent.message.id, body: 'hijack' })
    .then(() => check("cannot edit someone else's message", false, 'it succeeded'))
    .catch((error) => check("cannot edit someone else's message", error.message.includes('FORBIDDEN')));

  // ── Typing ────────────────────────────────────────────────────────────────
  const typing = waitFor(b.socket, 'typing:changed', (p) => p.userIds.includes(a.ready.self.id));
  a.socket.emit('typing:ping', { conversationId: general.id, isTyping: true });
  const typingPayload = await typing;
  check('typing fans out to peers', typingPayload.userIds.length === 1);

  const cleared = waitFor(b.socket, 'typing:changed', (p) => p.userIds.length === 0);
  a.socket.emit('typing:ping', { conversationId: general.id, isTyping: false });
  await cleared;
  check('typing clears immediately on stop', true);

  // ── Read receipts ─────────────────────────────────────────────────────────
  const receiptEvent = waitFor(a.socket, 'read:changed', (p) => p.userId === b.ready.self.id);
  await request(b.socket, 'read:advance', { conversationId: general.id, readAt: Date.now() });
  const receipt = await receiptEvent;
  check('read receipt fans out', receipt.conversationId === general.id);

  const rewind = await request(b.socket, 'read:advance', { conversationId: general.id, readAt: 1000 });
  check('read cursor never rewinds', rewind.receipt.lastReadAt > 1000);

  // ── Search ────────────────────────────────────────────────────────────────
  const found = await request(a.socket, 'search:messages', { query: 'pagination' });
  check('FTS5 search finds seeded content', found.hits.length > 0, `${found.hits.length} hits`);
  check('search highlights matched terms', found.hits[0].highlight.includes('<mark>'));

  // ── Authorisation boundary ────────────────────────────────────────────────
  const designChannel = a.ready.conversations.find((c) => c.name === 'design');
  if (designChannel) {
    await request(b.socket, 'conversation:open', { conversationId: 'aaaaaaaaaaaaaaaaaaaaaaaa' })
      .then(() => check('unknown conversation is refused', false, 'it succeeded'))
      .catch((error) => check('unknown conversation is refused', /NOT_FOUND|FORBIDDEN/.test(error.message)));
  }

  // ── Channel creation + direct messages ────────────────────────────────────
  const channel = await request(a.socket, 'conversation:create', {
    name: `smoke ${Date.now()}`,
    topic: 'Created by the smoke test',
    icon: '🧪',
    isPrivate: false,
    memberIds: [b.ready.self.id],
  });
  check('channel created and slugified', channel.conversation.name.startsWith('smoke-'), channel.conversation.name);

  const direct = await request(a.socket, 'conversation:direct', { userId: b.ready.self.id });
  const directAgain = await request(a.socket, 'conversation:direct', { userId: b.ready.self.id });
  check('direct conversations are idempotent', direct.conversation.id === directAgain.conversation.id);

  // ── Preferences + presence ────────────────────────────────────────────────
  const prefs = await request(a.socket, 'preferences:update', { theme: 'light', compactDensity: true });
  check('preferences persist', prefs.self.preferences.theme === 'light' && prefs.self.preferences.compactDensity);

  const presence = await request(a.socket, 'presence:set', { state: 'busy', message: 'Smoke testing' });
  check('presence updates', presence.self.presence.state === 'busy', presence.self.presence.message);

  // ── Validation ────────────────────────────────────────────────────────────
  await request(a.socket, 'message:send', { conversationId: general.id, nonce: 'n_empty_1234', body: '   ' })
    .then(() => check('empty messages are rejected', false, 'it succeeded'))
    .catch((error) => check('empty messages are rejected', error.message.includes('VALIDATION_FAILED')));

  const directory = await request(a.socket, 'directory:list');
  check('directory lists other members', directory.users.length === 4, `${directory.users.length} members`);

  a.socket.disconnect();
  b.socket.disconnect();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    console.log('\nFailures:');
    for (const f of failed) console.log(`  · ${f.name} — ${f.detail}`);
  }
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nSmoke test crashed:', error);
  process.exit(2);
});

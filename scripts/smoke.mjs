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

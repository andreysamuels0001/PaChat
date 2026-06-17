#!/usr/bin/env node
/**
 * One-command onboarding: creates the server .env from the template with a
 * freshly generated signing secret, builds the shared contract package, then
 * migrates + seeds the local database.
 */
import { randomBytes } from 'node:crypto';
import { access, copyFile, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, 'apps', 'server', '.env');
const examplePath = join(root, 'apps', 'server', '.env.example');

const step = (msg) => console.log(`\n\x1b[35m▌\x1b[0m \x1b[1m${msg}\x1b[0m`);
const ok = (msg) => console.log(`  \x1b[32m✔\x1b[0m ${msg}`);

function run(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.error(`\n\x1b[31m✖ "${cmd} ${args.join(' ')}" failed\x1b[0m`);
    process.exit(result.status ?? 1);
  }
}

step('Provisioning server environment');
let hasEnv = true;
try {
  await access(envPath);
} catch {
  hasEnv = false;
}

if (hasEnv) {
  ok('apps/server/.env already exists — left untouched');
} else {
  await copyFile(examplePath, envPath);
  const secret = randomBytes(48).toString('base64url');
  const refresh = randomBytes(48).toString('base64url');
  const contents = (await readFile(envPath, 'utf8'))
    .replace(/^JWT_ACCESS_SECRET=.*$/m, `JWT_ACCESS_SECRET=${secret}`)
    .replace(/^JWT_REFRESH_SECRET=.*$/m, `JWT_REFRESH_SECRET=${refresh}`);
  await writeFile(envPath, contents);
  ok('apps/server/.env created with generated signing secrets');
}

step('Building shared contracts');
run('npm', ['run', 'build:shared']);
ok('@pachat/shared compiled');

step('Preparing database');
run('npm', ['run', 'db:migrate']);
run('npm', ['run', 'db:seed']);
ok('schema migrated and demo workspace seeded');

/**
 * Draws the closing box from the content rather than from hard-coded padding,
 * so the frame stays square however long the lines inside it are.
 */
const lines = [
  'PaChat is ready.',
  '',
  'Start everything:   npm run dev',
  'Demo credentials:   ada@pachat.app / pachat123',
];

const inner = Math.max(...lines.map((line) => line.length)) + 4;
const rule = '─'.repeat(inner);
const body = lines.map((line) => `│  ${line.padEnd(inner - 2)}│`).join('\n');

console.log(`\n\x1b[35m┌${rule}┐\n${body}\n└${rule}┘\x1b[0m\n`);

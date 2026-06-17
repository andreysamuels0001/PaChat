#!/usr/bin/env node
/**
 * Removes every build artifact, cache and local runtime file in the workspace.
 * Usage: npm run clean  ·  npm run clean -- --deps  (also drops node_modules)
 */
import { rm, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dropDeps = process.argv.includes('--deps');

const TARGETS = [
  'dist',
  'out',
  'build',
  'release',
  '.vite',
  '.turbo',
  '.eslintcache',
  'coverage',
  'tsconfig.tsbuildinfo',
];

const WORKSPACE_DIRS = ['packages', 'apps'];

async function wipe(base) {
  for (const target of TARGETS) {
    await rm(join(base, target), { recursive: true, force: true });
  }
  if (dropDeps) {
    await rm(join(base, 'node_modules'), { recursive: true, force: true });
  }
}

const bases = [root];
for (const group of WORKSPACE_DIRS) {
  let entries = [];
  try {
    entries = await readdir(join(root, group), { withFileTypes: true });
  } catch {
    continue;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) bases.push(join(root, group, entry.name));
  }
}

await Promise.all(bases.map(wipe));

console.log(`✔ cleaned ${bases.length} package(s)${dropDeps ? ' including node_modules' : ''}`);

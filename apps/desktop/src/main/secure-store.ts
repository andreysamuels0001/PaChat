import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, safeStorage } from 'electron';

/**
 * Credential storage backed by the operating system keychain.
 *
 * `safeStorage` encrypts with DPAPI on Windows, the Keychain on macOS and
 * libsecret on Linux, so the long-lived refresh token is never readable as
 * plaintext on disk by another user account on the same machine.
 *
 * Values are kept in one small JSON file of base64 ciphertext rather than one
 * file per key — simpler to back up, and the whole file is useless without the
 * OS key.
 */

interface Vault {
  [key: string]: string;
}

let cache: Vault | null = null;

function vaultPath(): string {
  const directory = join(app.getPath('userData'), 'secure');
  mkdirSync(directory, { recursive: true });
  return join(directory, 'vault.json');
}

function readVault(): Vault {
  if (cache) return cache;
  const path = vaultPath();
  if (!existsSync(path)) {
    cache = {};
    return cache;
  }
  try {
    cache = JSON.parse(readFileSync(path, 'utf8')) as Vault;
  } catch {
    // A corrupt vault is recoverable: the worst outcome is one extra sign-in.
    cache = {};
  }
  return cache;
}

function writeVault(vault: Vault): void {
  cache = vault;
  writeFileSync(vaultPath(), JSON.stringify(vault), { encoding: 'utf8', mode: 0o600 });
}

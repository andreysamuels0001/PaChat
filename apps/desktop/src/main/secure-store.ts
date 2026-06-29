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

/**
 * Some Linux desktops have no secret service available. Falling back to
 * plaintext would silently downgrade security, so storage is refused instead
 * and the user simply signs in each launch.
 */
export function isAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

export function setSecret(key: string, value: string): void {
  if (!isAvailable()) return;
  const vault = readVault();
  vault[key] = safeStorage.encryptString(value).toString('base64');
  writeVault(vault);
}

export function getSecret(key: string): string | null {
  if (!isAvailable()) return null;
  const stored = readVault()[key];
  if (!stored) return null;
  try {
    return safeStorage.decryptString(Buffer.from(stored, 'base64'));
  } catch {
    // Decryption fails after an OS reinstall or a profile move. Drop the
    // unreadable entry so the next write starts clean.
    deleteSecret(key);
    return null;
  }
}

export function deleteSecret(key: string): void {
  const vault = readVault();
  if (!(key in vault)) return;
  delete vault[key];
  writeVault(vault);
}

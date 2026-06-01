import bcrypt from 'bcryptjs';

/**
 * bcrypt with a cost of 12 — roughly 250 ms per hash on current hardware,
 * which keeps interactive login snappy while making offline cracking of a
 * leaked table expensive.
 */
const COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/**
 * A pre-computed hash of an impossible password. Compared against when the
 * supplied identifier matches no account, so a failed login costs the same
 * wall-clock time whether or not the address exists — closing the timing
 * side-channel that otherwise enumerates registered users.
 */
export const DECOY_HASH = '$2a$12$Jd0VQ2m2YqTtPEaGM3Zqp.K1vXk0sQxJrZu9fWcRkqHfJ6Kp8S1Zu';

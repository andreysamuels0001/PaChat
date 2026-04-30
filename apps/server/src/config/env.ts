import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

/** Repository-relative root of this package (`apps/server`). */
export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

loadDotenv({ path: resolve(PACKAGE_ROOT, '.env') });

const booleanish = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default('127.0.0.1'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  DATA_DIR: z.string().default('./data'),
  UPLOAD_DIR: z.string().default('./data/uploads'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  ALLOW_REGISTRATION: booleanish.default('true'),
  AUTH_RATE_LIMIT: z.coerce.number().int().min(1).default(20),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  console.error(
    `\n✖ Invalid server configuration:\n${issues}\n\n` +
      `  Copy apps/server/.env.example to apps/server/.env, or run \`npm run setup\`\n` +
      `  from the repository root to generate one automatically.\n`,
  );
  process.exit(1);
}

const raw = parsed.data;
const absolutise = (p: string) => (isAbsolute(p) ? p : resolve(PACKAGE_ROOT, p));

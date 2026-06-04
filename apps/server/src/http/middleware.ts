import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodSchema } from 'zod';
import { authenticate, type Principal } from '../services/auth-service.js';
import { AppError, fieldsFromZod, publicShape, toAppError, unauthorized } from '../lib/errors.js';
import { bearerFrom } from '../lib/tokens.js';
import { FixedWindowLimiter } from '../lib/rate-limit.js';
import { env } from '../config/env.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('http');

/** The authenticated principal, attached by `requireAuth`. */
declare module 'express-serve-static-core' {
  interface Request {
    principal?: Principal;
  }
}

/**
 * Wraps an async handler so a rejected promise reaches the error middleware.
 * Express 4 does not await handlers, so without this an async throw becomes an
 * unhandled rejection and the request hangs until the client times out.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

/** Rejects the request unless it carries a valid, unrevoked access token. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  try {
    const token = bearerFrom(req.header('authorization')) ?? queryToken(req);
    if (!token) throw unauthorized('Missing access token');
    req.principal = authenticate(token);
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Accepts `?token=` as a fallback to the Authorization header.
 *
 * Needed only for `<img src>` and `<a download>` on attachment URLs, where the
 * browser controls the request and cannot be given a header. Restricted to GET
 * so no state-changing endpoint can be triggered by a URL alone.
 */
function queryToken(req: Request): string | null {
  if (req.method !== 'GET') return null;
  const value = req.query.token;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Parses and replaces `req.body` with the schema's validated output. */
export function validateBody<T>(schema: ZodSchema<T>): RequestHandler {
  return (req, _res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(
          new AppError('VALIDATION_FAILED', 'Some fields need attention', {
            fields: fieldsFromZod(error),
          }),
        );
        return;
      }
      next(error);
    }
  };
}

/** Per-IP fixed-window limiter, used to blunt credential stuffing. */
export function rateLimit(limit: number = env.AUTH_RATE_LIMIT, windowMs = 60_000): RequestHandler {
  const limiter = new FixedWindowLimiter(limit, windowMs);
  return (req, res, next) => {
    const key = req.ip ?? 'unknown';
    const retryAfterMs = limiter.check(key);
    if (retryAfterMs === null) {
      next();
      return;
    }
    res.setHeader('Retry-After', Math.ceil(retryAfterMs / 1000));
    next(new AppError('RATE_LIMITED', 'Too many attempts — try again shortly'));
  };
}

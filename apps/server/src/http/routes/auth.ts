import { Router } from 'express';
import { loginSchema, refreshSchema, registerSchema } from '@pachat/shared';
import { z } from 'zod';
import * as auth from '../../services/auth-service.js';
import { asyncHandler, rateLimit, requireAuth, validateBody } from '../middleware.js';
import { unauthorized } from '../../lib/errors.js';

/**
 * Credential and token-lifecycle endpoints. These are the only routes that
 * accept a password, and the only ones behind the per-IP rate limiter.
 */
export const authRouter = Router();

const limiter = rateLimit();

authRouter.post(
  '/register',
  limiter,
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const result = await auth.register(req.body, {
      userAgent: req.header('user-agent') ?? null,
      ip: req.ip ?? null,
    });
    res.status(201).json(result);
  }),
);

authRouter.post(
  '/login',
  limiter,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await auth.login(req.body, {
      userAgent: req.header('user-agent') ?? null,
      ip: req.ip ?? null,
    });
    res.json(result);
  }),
);

authRouter.post('/refresh', validateBody(refreshSchema), (req, res) => {
  // No device context: a refresh rotates an existing session rather than
  // creating one, so the originally recorded device stays authoritative.
  res.json(auth.refresh(req.body.refreshToken));
});

authRouter.post(
  '/logout',
  validateBody(z.object({ refreshToken: z.string().min(1) })),
  (req, res) => {
    auth.logout(req.body.refreshToken);
    // Always 204, whether or not the token matched a live session: telling a
    // caller that a token was already invalid is information they do not need.
    res.status(204).end();
  },
);

authRouter.get('/me', requireAuth, (req, res) => {
  if (!req.principal) throw unauthorized();
  res.json({ self: auth.selfFor(req.principal.userId) });
});

import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { API_PREFIX } from '@pachat/shared';
import { env } from '../config/env.js';
import { authRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';
import { filesRouter, uploadRouter } from './routes/uploads.js';
import { errorHandler, notFoundHandler, requestLogger } from './middleware.js';

/**
 * Assembles the HTTP surface.
 *
 * The REST layer stays intentionally thin — credentials, token lifecycle and
 * binary transfer. Everything stateful travels over the socket, so this app is
 * stateless and safe to put behind any reverse proxy without sticky sessions.
 */
export function createApp(): Express {
  const app = express();

  // Trust one proxy hop so `req.ip` is the real client address behind nginx or
  // Caddy, which the rate limiter keys on.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // The desktop client is the only consumer and enforces its own CSP in
      // the renderer; a server-side policy here would apply to nothing but
      // error JSON.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        // A packaged Electron renderer sends no Origin header, so a missing
        // origin must be allowed — it is the production desktop case.
        if (!origin) return callback(null, true);
        if (env.corsOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`Origin ${origin} is not allowed`));
      },
      credentials: true,
      maxAge: 86_400,
    }),
  );

  // Chat payloads are small; a tight body limit removes a trivial DoS vector.
  // Binary uploads go through multer on their own route and are unaffected.
  app.use(express.json({ limit: '128kb' }));
  app.use(requestLogger);

  app.use(`${API_PREFIX}/health`, healthRouter);
  app.use(`${API_PREFIX}/auth`, authRouter);
  app.use(`${API_PREFIX}/uploads`, uploadRouter);
  app.use('/files', filesRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

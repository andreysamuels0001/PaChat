import { z } from 'zod';
import {
  accentColorSchema,
  attachmentSchema,
  emailSchema,
  passwordSchema,
  selfSchema,
  usernameSchema,
} from './domain.js';
import { LIMITS } from './constants.js';

/**
 * The REST surface is deliberately small: credentials, token lifecycle and
 * binary uploads. Everything stateful flows over the socket, so the HTTP layer
 * stays cacheable, stateless and trivial to put behind a reverse proxy.
 */

export const API_PREFIX = '/api';

export const ROUTES = {
  health: `${API_PREFIX}/health`,
  register: `${API_PREFIX}/auth/register`,
  login: `${API_PREFIX}/auth/login`,
  refresh: `${API_PREFIX}/auth/refresh`,
  logout: `${API_PREFIX}/auth/logout`,
  me: `${API_PREFIX}/auth/me`,
  upload: `${API_PREFIX}/uploads`,
} as const;

import { Router } from 'express';
import { PROTOCOL_VERSION, type HealthResponse } from '@pachat/shared';
import { connectionCount } from '../../services/presence-service.js';
import { schemaVersion } from '../../db/migrate.js';

/**
 * Liveness and version probe. Unauthenticated by design so a process manager
 * or container orchestrator can poll it, and deliberately free of any detail
 * an attacker could use for fingerprinting beyond the version already baked
 * into the client.
 */
export const healthRouter = Router();

const VERSION = '1.0.0';
const bootedAt = Date.now();

healthRouter.get('/', (_req, res) => {
  const payload: HealthResponse & { schemaVersion: number } = {
    status: 'ok',
    service: 'pachat-server',
    version: VERSION,
    protocolVersion: PROTOCOL_VERSION,
    uptimeSeconds: Math.round((Date.now() - bootedAt) / 1000),
    connections: connectionCount(),
    schemaVersion: schemaVersion(),
  };
  res.json(payload);
});

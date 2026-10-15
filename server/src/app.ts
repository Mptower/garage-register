/**
 * Assembles the Express application.
 *
 * Split out from `index.ts` so tests can build an app around a throwaway
 * database and drive it over a real socket, without booting the process.
 */
import express from 'express';
import type { Express } from 'express';

import type { ServerConfig } from './config.ts';
import type { Database } from './db/open.ts';
import { errorHandler, requestLogger, sendError } from './http.ts';
import type { ApiDeps } from './routes/api.ts';
import { createApiRouter } from './routes/api.ts';
import { mountClient } from './static.ts';

export interface CreateAppOptions {
  db: Database;
  config: ServerConfig;
  /**
   * The Home Assistant bridge, when there is one.
   *
   * Optional because there usually is not: on a laptop, in the tests, and in
   * any deployment that is not the add-on there is no Supervisor to talk to.
   * Leaving it out is a supported way to run the app, not a degraded one.
   */
  homeAssistant?: ApiDeps['homeAssistant'];
}

export interface AppInfo {
  app: Express;
  /** False when `serveClient` is on but there is no build on disk. */
  clientMounted: boolean;
}

export function createApp({ db, config, homeAssistant }: CreateAppOptions): AppInfo {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.set('case sensitive routing', false);

  if (config.logRequests) {
    app.use(requestLogger());
  }

  // A service log entry is small; the cap is there so a malformed client
  // cannot push an unbounded body into memory.
  app.use(express.json({ limit: '256kb' }));

  app.use(`${config.basePath}/api`, createApiRouter({ db, homeAssistant }));

  let clientMounted = false;
  if (config.serveClient) {
    const result = mountClient(app, config.clientDir, config.basePath);
    clientMounted = result.mounted;
    if (!result.mounted) {
      console.warn(
        `Not serving a client bundle (${result.reason}). ` +
          'Run `npm run build` first, set CLIENT_DIR, or set SERVE_CLIENT=false.',
      );
    }
  }

  app.use((req, res) => {
    sendError(res, 404, 'not_found', `Not found: ${req.method} ${req.originalUrl}`);
  });

  app.use(errorHandler(config.isProduction));

  return { app, clientMounted };
}

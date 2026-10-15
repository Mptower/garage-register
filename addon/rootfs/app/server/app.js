/**
 * Assembles the Express application.
 *
 * Split out from `index.ts` so tests can build an app around a throwaway
 * database and drive it over a real socket, without booting the process.
 */
import express from 'express';
import { errorHandler, requestLogger, sendError } from "./http.js";
import { createApiRouter } from "./routes/api.js";
import { mountClient } from "./static.js";
export function createApp({ db, config, homeAssistant }) {
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
            console.warn(`Not serving a client bundle (${result.reason}). ` +
                'Run `npm run build` first, set CLIENT_DIR, or set SERVE_CLIENT=false.');
        }
    }
    app.use((req, res) => {
        sendError(res, 404, 'not_found', `Not found: ${req.method} ${req.originalUrl}`);
    });
    app.use(errorHandler(config.isProduction));
    return { app, clientMounted };
}
//# sourceMappingURL=app.js.map
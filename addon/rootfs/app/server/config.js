/**
 * Server configuration, read once from the environment.
 *
 * Everything here is deployment plumbing set by run.sh in the add-on, or left
 * at its default on a laptop. Nothing a vehicle owner would ever change lives
 * here — that belongs in the database, behind the app's own Settings screen.
 */
import path from 'node:path';
function bool(value, fallback) {
    if (value === undefined || value === '')
        return fallback;
    return !['0', 'false', 'no', 'off'].includes(value.trim().toLowerCase());
}
function int(value, fallback) {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}
/** Normalise to a leading slash with no trailing slash; "/" becomes "". */
export function normaliseBasePath(raw) {
    const trimmed = (raw ?? '/').trim();
    if (trimmed === '' || trimmed === '/')
        return '';
    const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return withLeading.endsWith('/') ? withLeading.slice(0, -1) : withLeading;
}
export function loadConfig(env = process.env) {
    const dataDir = env.DATA_DIR ?? path.resolve('data');
    const isProduction = (env.NODE_ENV ?? 'development') === 'production';
    return {
        host: env.HOST ?? '127.0.0.1',
        port: int(env.PORT, 8099),
        basePath: normaliseBasePath(env.BASE_PATH),
        dataDir,
        databaseFile: env.DATABASE_FILE ?? path.join(dataDir, 'garage.db'),
        clientDir: env.CLIENT_DIR ?? path.resolve('client', 'dist'),
        serveClient: bool(env.SERVE_CLIENT, true),
        logRequests: bool(env.LOG_REQUESTS, !isProduction),
        isProduction,
        sensorPrefix: (env.SENSOR_PREFIX ?? 'garage').trim() || 'garage',
        notifyService: (env.NOTIFY_SERVICE ?? '').trim(),
        supervisorToken: env.SUPERVISOR_TOKEN?.trim() || null,
        supervisorUrl: (env.SUPERVISOR_URL ?? 'http://supervisor').replace(/\/+$/, ''),
        optionsPath: env.ADDON_OPTIONS_PATH ?? path.join(dataDir, 'options.json'),
    };
}
//# sourceMappingURL=config.js.map
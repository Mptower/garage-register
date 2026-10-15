/**
 * Server configuration, read once from the environment.
 *
 * Everything here is deployment plumbing set by run.sh in the add-on, or left
 * at its default on a laptop. Nothing a vehicle owner would ever change lives
 * here — that belongs in the database, behind the app's own Settings screen.
 */
import path from 'node:path';

export interface ServerConfig {
  host: string;
  port: number;
  /** Always "/" under ingress; configurable so the app can live at a sub-path. */
  basePath: string;
  dataDir: string;
  databaseFile: string;
  clientDir: string;
  serveClient: boolean;
  logRequests: boolean;
  isProduction: boolean;
  /** Prefix for published entity ids, e.g. "garage" -> sensor.garage_*. */
  sensorPrefix: string;
  /** Empty when the installer left it blank: publish sensors, notify nobody. */
  notifyService: string;
  /**
   * Present only under Supervisor. Its absence is the normal way the app runs
   * on a laptop, not a failure — the Home Assistant bridge simply stays off.
   */
  supervisorToken: string | null;
  /** Bare Supervisor root; the core API path is appended by the caller. */
  supervisorUrl: string;
  /** Where Supervisor writes the rendered add-on options. */
  optionsPath: string;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(value.trim().toLowerCase());
}

function int(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Normalise to a leading slash with no trailing slash; "/" becomes "". */
export function normaliseBasePath(raw: string | undefined): string {
  const trimmed = (raw ?? '/').trim();
  if (trimmed === '' || trimmed === '/') return '';
  const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeading.endsWith('/') ? withLeading.slice(0, -1) : withLeading;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
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

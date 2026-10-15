/**
 * The add-on-level factory reset.
 *
 * Supervisor cannot put a button on the add-on configuration page, only
 * fields — so the reset is a one-shot boolean the add-on consumes on start.
 *
 * The ordering below is the whole safety property. The flag lives in the
 * add-on's *configuration*, not in the database, so wiping without clearing it
 * first would wipe again on every subsequent restart: one mis-set toggle would
 * quietly destroy the garage forever. The flag is therefore cleared through
 * Supervisor first, and nothing is deleted unless that succeeds.
 */
import type { Database } from '../db/open.ts';
import * as repo from '../db/repo.ts';
import type { AddonOptions } from './options.ts';
import { clearFactoryResetFlag } from './options.ts';

export interface FactoryResetDeps {
  db: Database;
  options: AddonOptions;
  supervisorUrl: string;
  token: string | null;
  /** Seam for tests; defaults to the real Supervisor call. */
  clearFlag?: (baseUrl: string, token: string, options: AddonOptions) => Promise<void>;
  log?: (message: string) => void;
}

export type FactoryResetOutcome =
  | { performed: false; reason: 'not_requested' | 'no_supervisor' | 'clear_failed' }
  | { performed: true; vehicles: number };

export async function runFactoryResetIfRequested({
  db,
  options,
  supervisorUrl,
  token,
  clearFlag = clearFactoryResetFlag,
  log = console.warn,
}: FactoryResetDeps): Promise<FactoryResetOutcome> {
  if (!options.factoryReset) return { performed: false, reason: 'not_requested' };

  if (!token) {
    // Without Supervisor the flag cannot be turned off again, so honouring it
    // would mean wiping on every start with no way to stop it.
    log(
      '[garage-register] factory_reset is set but there is no Supervisor token; ' +
        'refusing to wipe, because the flag could not be cleared afterwards.',
    );
    return { performed: false, reason: 'no_supervisor' };
  }

  try {
    await clearFlag(supervisorUrl, token, options);
  } catch (error) {
    log(
      `[garage-register] factory_reset is set but clearing it failed, so nothing was ` +
        `deleted: ${(error as Error).message}`,
    );
    return { performed: false, reason: 'clear_failed' };
  }

  const { vehicles } = repo.resetGarage(db);
  log(
    `[garage-register] FACTORY RESET: removed ${vehicles} vehicle(s) and all their history. ` +
      'The option has been turned back off.',
  );
  return { performed: true, vehicles };
}

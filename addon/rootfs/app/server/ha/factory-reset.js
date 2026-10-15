import * as repo from "../db/repo.js";
import { clearFactoryResetFlag } from "./options.js";
export async function runFactoryResetIfRequested({ db, options, supervisorUrl, token, clearFlag = clearFactoryResetFlag, log = console.warn, }) {
    if (!options.factoryReset)
        return { performed: false, reason: 'not_requested' };
    if (!token) {
        // Without Supervisor the flag cannot be turned off again, so honouring it
        // would mean wiping on every start with no way to stop it.
        log('[garage-register] factory_reset is set but there is no Supervisor token; ' +
            'refusing to wipe, because the flag could not be cleared afterwards.');
        return { performed: false, reason: 'no_supervisor' };
    }
    try {
        await clearFlag(supervisorUrl, token, options);
    }
    catch (error) {
        log(`[garage-register] factory_reset is set but clearing it failed, so nothing was ` +
            `deleted: ${error.message}`);
        return { performed: false, reason: 'clear_failed' };
    }
    const { vehicles } = repo.resetGarage(db);
    log(`[garage-register] FACTORY RESET: removed ${vehicles} vehicle(s) and all their history. ` +
        'The option has been turned back off.');
    return { performed: true, vehicles };
}
//# sourceMappingURL=factory-reset.js.map
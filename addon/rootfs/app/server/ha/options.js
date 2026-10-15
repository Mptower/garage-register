/**
 * Add-on options, as Supervisor writes them.
 *
 * Supervisor renders the `schema` in config.yaml into a form and writes the
 * result to /data/options.json; there is no bashio in this image to read it,
 * so it is read here and layered over the environment defaults.
 *
 * Only *entity plumbing* and the factory reset live here. Everything a vehicle
 * owner changes belongs to the app's own screens — see config.yaml.
 */
import fs from 'node:fs';
export function readAddonOptions(optionsPath, defaults) {
    const fallback = { ...defaults, factoryReset: false };
    let raw;
    try {
        raw = fs.readFileSync(optionsPath, 'utf8');
    }
    catch {
        // No file is the ordinary case on a laptop, not a fault.
        return fallback;
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (error) {
        console.warn(`[garage-register] ${optionsPath} is not valid JSON, using defaults: ${error.message}`);
        return fallback;
    }
    if (parsed === null || typeof parsed !== 'object')
        return fallback;
    const source = parsed;
    const text = (key, fallbackValue) => {
        const value = source[key];
        return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallbackValue;
    };
    return {
        sensorPrefix: text('sensor_prefix', defaults.sensorPrefix),
        notifyService: text('notify_service', defaults.notifyService),
        factoryReset: source.factory_reset === true,
    };
}
/**
 * Turns the factory_reset option back off, through Supervisor.
 *
 * This is what stops a reset from being permanent: the flag is stored in the
 * add-on's configuration, so without clearing it the add-on would wipe the
 * database on *every* subsequent start. The caller must therefore clear it
 * BEFORE wiping, and must not wipe at all if clearing fails.
 */
export async function clearFactoryResetFlag(baseUrl, token, current) {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/addons/self/options`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
            options: {
                sensor_prefix: current.sensorPrefix,
                notify_service: current.notifyService,
                factory_reset: false,
            },
        }),
        signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
        throw new Error(`Supervisor refused to clear factory_reset: ${response.status} ${await response.text()}`);
    }
}
//# sourceMappingURL=options.js.map
/**
 * Process entrypoint: open the database, start the server, shut down cleanly.
 *
 * Node is PID 1 in the add-on container, so SIGTERM arrives here directly when
 * Home Assistant stops the add-on. Closing the database checkpoints the WAL
 * into the .db file, which is what makes HA's cold backup complete.
 */
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { closeDatabase, openDatabase } from "./db/open.js";
import { HomeAssistantBridge } from "./ha/bridge.js";
import { runFactoryResetIfRequested } from "./ha/factory-reset.js";
import { readAddonOptions } from "./ha/options.js";
import { startReminderSchedule } from "./reminders.js";
const config = loadConfig();
const db = openDatabase({ file: config.databaseFile });
// Supervisor writes the rendered add-on options to /data/options.json; they
// win over the environment, which only carries defaults.
const addonOptions = readAddonOptions(config.optionsPath, {
    sensorPrefix: config.sensorPrefix,
    notifyService: config.notifyService,
});
// Consumed before anything is served, so a reset cannot race a request.
const resetOutcome = await runFactoryResetIfRequested({
    db,
    options: addonOptions,
    supervisorUrl: config.supervisorUrl,
    token: config.supervisorToken,
});
const bridge = new HomeAssistantBridge({
    token: config.supervisorToken,
    baseUrl: config.supervisorUrl,
    sensorPrefix: addonOptions.sensorPrefix,
    notifyService: addonOptions.notifyService,
});
const { app, clientMounted } = createApp({
    db,
    config,
    homeAssistant: {
        available: bridge.available,
        sensorPrefix: bridge.sensorPrefix,
        publish: () => bridge.publishAll(db),
    },
    reminders: {
        available: bridge.available,
        notifyConfigured: bridge.notifyConfigured,
        notify: (title, message) => bridge.notify(title, message),
    },
});
const server = app.listen(config.port, config.host, () => {
    console.log(`[garage-register] listening on http://${config.host}:${config.port}${config.basePath || '/'}`);
    console.log(`[garage-register] database ${config.databaseFile}`);
    console.log(clientMounted
        ? '[garage-register] serving the client bundle'
        : '[garage-register] API only, no client bundle mounted');
    console.log(bridge.available
        ? `[garage-register] Home Assistant bridge on, prefix "${addonOptions.sensorPrefix}"`
        : '[garage-register] no Supervisor token; running without Home Assistant');
    if (resetOutcome.performed) {
        console.log(`[garage-register] started from an empty garage after a factory reset`);
    }
});
/**
 * Publishing is best-effort and must never take the app down with it: if
 * Supervisor is slow or restarting, the garage still works.
 */
async function publishQuietly() {
    if (!bridge.available)
        return;
    try {
        const { published } = await bridge.publishAll(db);
        console.log(`[garage-register] published ${published} sensors`);
    }
    catch (error) {
        console.warn(`[garage-register] publish failed: ${error.message}`);
    }
}
void publishQuietly();
// Intervals here are measured in months; an hourly refresh is ample and keeps
// "days since service" honest without hammering Supervisor.
const refresh = setInterval(publishQuietly, 60 * 60 * 1000);
refresh.unref();
// Off unless switched on from the app's own Settings screen, and silent when
// no notify service was configured.
const reminderSchedule = startReminderSchedule(db, {
    available: bridge.available,
    notifyConfigured: bridge.notifyConfigured,
    notify: (title, message) => bridge.notify(title, message),
});
console.log(bridge.notifyConfigured
    ? `[garage-register] reminders will go to ${addonOptions.notifyService}`
    : '[garage-register] no notify_service set; reminders will be collected but not sent');
let shuttingDown = false;
function shutdown(signal) {
    if (shuttingDown)
        return;
    shuttingDown = true;
    console.log(`[garage-register] ${signal} received, shutting down`);
    clearInterval(refresh);
    reminderSchedule.stop();
    server.close(() => {
        try {
            closeDatabase(db);
            console.log('[garage-register] database closed');
        }
        catch (error) {
            console.error('[garage-register] error closing database:', error);
        }
        process.exit(0);
    });
    // Supervisor sends SIGKILL after its own grace period; exiting first on our
    // own terms means the WAL checkpoint has already happened.
    setTimeout(() => {
        console.warn('[garage-register] forcing exit');
        process.exit(1);
    }, 8000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
//# sourceMappingURL=index.js.map
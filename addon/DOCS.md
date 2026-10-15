# The Garage Register

Maintenance, modifications and paperwork for a classic vehicle collection, as a
Home Assistant add-on with its own sidebar panel.

Everything a vehicle owner edits lives in the app itself — vehicles, plates,
service intervals, log entries, the wishlist, upgrades and renewal dates. The
add-on configuration below is only the handful of identifiers that depend on how
your particular Home Assistant is named.

## Installation

1. In Home Assistant, go to **Settings → Add-ons → Add-on store**.
2. Open the ⋮ menu, choose **Repositories**, and add:

   ```
   https://github.com/Mptower/garage-register
   ```

3. Find **The Garage Register** in the store and select **Install**.
4. Select **Start**. The first start builds the database and may take a few
   seconds longer than later ones.
5. Open **Garage** in the sidebar.

Updates appear on the normal Home Assistant **Settings → Add-ons** page whenever
a new version is published, the same as any other add-on.

## Configuration

```yaml
sensor_prefix: garage
notify_service: ""
factory_reset: false
```

### `sensor_prefix`

Prefix for the entities the add-on publishes, for example
`sensor.garage_plymouth_odometer`. Change it if those ids are already taken. The
add-on never overwrites an entity it did not create.

### `notify_service`

Any notification service, such as `notify.mobile_app_phone`, used to tell you a
service is coming due. Leave it blank to publish the sensors but send nothing.

Whether reminders fire at all, what time of day they are checked, and how far
ahead they warn are all on the app's own **Settings** screen — not here. This
option is only the address to send to, because that depends on what your
phone's notify service is called rather than on anything about your cars.

Reminders are off until you switch them on. The Settings screen also shows
exactly what would be sent right now, and has a **Send one now** button to
confirm it reaches your phone.

> The daily check runs at the hour you choose, in Home Assistant's timezone.
> Supervisor passes that through to the add-on, and Node carries its own
> timezone database, so this is your morning rather than UTC.

### `factory_reset`

Empties the garage on the next start: every vehicle, together with its
components, service log, wishlist and upgrades. Your own settings survive.

It is one-shot. The add-on switches this back off through Supervisor **before**
it deletes anything, so a reset can never repeat on the next restart — and if it
cannot switch it off, it deletes nothing at all and says so in the log.

To apply it: set it to `true`, **Save**, then **Restart** the add-on.

> Changing one car does not need this. Archive or delete that vehicle from
> inside the app, which leaves the rest of the collection alone. There is also a
> per-vehicle **Reset history** that clears the log while keeping the car.

## Backups

The database lives in `/data`, which is the volume Home Assistant's own backups
snapshot, so the garage is included in every HA backup with no setup.

Backups are taken cold: HA stops the add-on first, which checkpoints SQLite's
write-ahead log into the database file so the snapshot is a complete copy rather
than a file with pending writes beside it.

## Why there is no port mapping

The add-on is ingress-only on purpose. The app has no login of its own, so every
request has to arrive through Home Assistant's ingress proxy, which has already
authenticated your HA session. Nothing is published to the host network, and
there is no URL that reaches the app without going through Home Assistant first.

## Home Assistant integration

With `homeassistant_api` granted, the add-on publishes a few entities per
vehicle — odometer, next service due, and overdue counts — so they can be used
in your own automations and dashboards.

The token that allows this is issued by Supervisor and used only by the server.
It is never sent to the browser.

If the add-on is run outside Home Assistant, on a laptop for instance, there is
no Supervisor and no token; the app simply runs without publishing anything.

## Troubleshooting

**The sidebar panel is blank or assets fail to load.** Reload the page once
after an update; the browser may be holding the previous build's asset names.

**The add-on stops immediately after starting.** Check the add-on log. A clean
start logs `[garage-register] starting on :8099`.

**`factory_reset` did nothing.** Look for a line explaining it refused. The most
likely reason is that the add-on could not reach Supervisor to switch the flag
off, in which case it deliberately leaves your data alone rather than risk
wiping it again on every subsequent restart.

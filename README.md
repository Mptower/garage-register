# The Garage Register

A Home Assistant add-on for tracking maintenance, modifications and paperwork
across a classic vehicle collection. It installs from the add-on store, appears
in the sidebar, and keeps its data in Home Assistant's own backed-up volume.

It was built around a 1949 Plymouth Special Deluxe, which is to say it was built
around the awkward parts: a car with both a 6V and a 12V battery, a registration
that never expires, and a service history that is mostly paper.

## Install

Add this repository in **Settings → Add-ons → Add-on store → ⋮ → Repositories**:

```
https://github.com/Mptower/garage-register
```

Then install **The Garage Register** and start it. Full instructions, options
and troubleshooting are in [addon/DOCS.md](addon/DOCS.md).

## What it tracks

- **Vehicles** — plate, photo, odometer, one card per car.
- **Components** — anything with a replacement life: fluids, batteries, filters,
  belts, tires, ignition parts. Intervals in miles, months, or both; whichever
  axis is further through is the one that governs. Zero on both means
  replace-on-failure, which never reads as overdue.
- **Service log** — logging work against a component resets its interval and
  writes the ledger entry in the same transaction, so the gauge and the history
  cannot drift apart.
- **Wishlist** — prioritised by urgency: crucial safety, mechanical, cosmetic.
- **Upgrades** — non-stock work and its status, 12V conversions included.
- **Paperwork** — insurance and registration renewals, permanent registrations
  included.

Everything above is edited inside the app. The add-on's own configuration is
only the few identifiers that depend on how your Home Assistant is named.

## Development

Requires Node 22.6 or later — the server uses the built-in `node:sqlite`.

```bash
npm install
npm run dev        # server and client together, with reload
npm test           # shared domain + server
npm run typecheck
```

`npm run dev` serves the client on Vite's port and proxies the API, so it runs
on a laptop with no Home Assistant present. Without Supervisor the app simply
does not publish entities; everything else works.

### Layout

| Path       | What it is                                                  |
| ---------- | ----------------------------------------------------------- |
| `shared/`  | Types and all interval maths. No I/O, so it is cheap to test |
| `server/`  | Express 5 + `node:sqlite`, REST API, HA bridge               |
| `client/`  | Vite + React + Tailwind                                      |
| `addon/`   | The add-on manifest, Dockerfile and build context            |
| `scripts/` | `build-addon.mjs`, which stages the release tree             |

### Releasing

```bash
npm run build:addon
```

This compiles all three workspaces and stages the runtime into
`addon/rootfs/app/`, **which is committed**. Supervisor clones this repository
and runs `docker build` against `addon/` as it finds it — it never runs npm — so
the staged tree is literally what ships. `npm run check:addon` fails the build
if it is out of date, and CI runs it on every push.

To publish an update, bump `version:` in `addon/config.yaml`, run
`npm run build:addon`, commit the result and push. Home Assistant offers the
update on its normal add-ons page.

One trap worth knowing about: `.gitignore` matches the bare names `dist` and
`node_modules` at *any* depth, so the staging script flattens those directory
names away. A surviving one would be committed on the machine that built it and
missing from the clone Supervisor builds — an add-on that works for you and is
broken for everyone else. Both the staging script and CI refuse to finish if one
survives.

## Licence

MIT.

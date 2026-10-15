# Changelog

## 0.2.0

**Photographs are now uploaded and stored with the garage.**

Previously this was a text field holding a path or a URL. A path pointed at
something outside the add-on, so restoring a backup onto another machine
brought the database back with every photo reference dangling. Uploaded photos
now live in `/data` beside the database, which is the volume Home Assistant's
backups snapshot — so the garage restores whole.

- Pick a photo in the vehicle dialog, with a preview before saving.
- Large images are scaled down in the browser before upload, so a 12 megapixel
  phone photo becomes a few hundred kilobytes rather than a few megabytes in
  every future backup. EXIF rotation is applied rather than discarded, so
  portrait photos no longer end up on their side.
- Replacing or removing a photo deletes the file it replaced, and deleting a
  vehicle takes its photograph with it, so nothing is orphaned in `/data`.
- A web address can still be used instead, for a photo hosted elsewhere.

Also in this release:

- Added the ESLint configuration the lint script had always expected but never
  had, so `npm run lint` works and CI can enforce it.
- `npm run check:addon` no longer leaves a temporary directory behind when it
  fails, which it did on every failed run.

## 0.1.0

First release.

- Track any number of vehicles, each with its own plate, photo and odometer.
- Components with service intervals in miles, months or both. A component is
  anything with a replacement life — fluids, batteries, filters, belts, tires,
  ignition parts — so a car with both a 6V and a 12V battery is just two
  components rather than a special case.
- Service log. Logging work against a component resets its interval and writes
  the ledger entry in one step, so the two can never disagree.
- Wishlist, prioritised by urgency: crucial safety, mechanical, cosmetic.
- Upgrades and modifications, with status.
- Paperwork: insurance and registration renewal dates, including permanent
  registrations, which are left out of the expiry maths rather than read as
  expired forever.
- Sensors published to Home Assistant, and an optional notification when
  something comes due.
- Per-vehicle history reset, and an add-on level `factory_reset` for when the
  collection changes hands.

# Changelog

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

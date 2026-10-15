/**
 * Reminder selection, the decision to re-send, and digest formatting.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { componentState } from '../src/domain.ts';
import { collectReminders, decideSend, formatDigest } from '../src/reminders.ts';
import { REMINDER_DEFAULTS, readReminderSettings } from '../src/settings.ts';
import type { ReminderVehicle } from '../src/reminders.ts';
import type { Component } from '../src/types.ts';

const NOW = new Date(2026, 9, 14); // 14 Oct 2026, local midnight

const ON = { ...REMINDER_DEFAULTS, enabled: true };

function component(over: Partial<Component> & { id: number; name: string }): Component {
  return {
    vehicleId: 1,
    category: 'fluid',
    icon: '',
    spec: '',
    qty: 1,
    intervalMiles: 1500,
    // Left at zero so mileage alone governs and the fixtures stay legible.
    intervalMonths: 0,
    lastDate: '2026-04-01',
    lastOdometer: 45_000,
    notes: '',
    ...over,
  } as Component;
}

function vehicle(over: Partial<ReminderVehicle> = {}, odometer = 48_312): ReminderVehicle {
  const components = (over.components as Component[] | undefined) ?? [
    component({ id: 10, name: 'Engine Oil' }),
  ];
  return {
    id: 1,
    name: '1949 Plymouth Special Deluxe',
    registrationPermanent: true,
    registrationExpires: null,
    insuranceRenews: null,
    ...over,
    components: components.map((c) => componentState(c, odometer, NOW)),
  };
}

// ------------------------------------------------------------- what is due
test('an overdue component says how far over it is', () => {
  const items = collectReminders([vehicle()], ON, NOW);
  assert.equal(items.length, 1);
  assert.equal(items[0].severity, 'overdue');
  assert.equal(items[0].subject, 'Engine Oil');
  // 48,312 - 45,000 = 3,312 covered against a 1,500 mile interval.
  assert.match(items[0].detail, /1,812 mi over/);
});

test('a component merely approaching its interval is optional', () => {
  const approaching = vehicle({
    components: [component({ id: 10, name: 'Engine Oil', lastOdometer: 47_000 })],
  } as Partial<ReminderVehicle>);

  assert.equal(collectReminders([approaching], ON, NOW)[0].severity, 'soon');
  assert.equal(
    collectReminders([approaching], { ...ON, includeDueSoon: false }, NOW).length,
    0,
    'turning it off should silence the approaching band entirely',
  );
});

test('a component that has never been serviced is not overdue', () => {
  // No last service date means nothing to be late for. Reporting these would
  // make a freshly added car arrive with a screen full of false alarms.
  const fresh = vehicle({
    components: [component({ id: 10, name: 'Engine Oil', lastDate: null, lastOdometer: null })],
  } as Partial<ReminderVehicle>);
  assert.equal(collectReminders([fresh], ON, NOW).length, 0);
});

test('a permanent registration is never reported, however old', () => {
  // The Wisconsin Collector plate has no expiry. Treating the blank date as
  // expired would raise it every single day, for ever.
  const permanent = vehicle({ registrationPermanent: true, registrationExpires: null });
  assert.equal(
    collectReminders([permanent], ON, NOW).filter((i) => i.kind === 'registration').length,
    0,
  );
});

test('a dated registration is reported only once it is within the lead time', () => {
  const far = vehicle({ registrationPermanent: false, registrationExpires: '2027-06-01' });
  assert.equal(collectReminders([far], ON, NOW).filter((i) => i.kind === 'registration').length, 0);

  const near = vehicle({ registrationPermanent: false, registrationExpires: '2026-11-01' });
  const found = collectReminders([near], ON, NOW).find((i) => i.kind === 'registration');
  assert.ok(found);
  assert.equal(found.severity, 'soon');
  assert.match(found.detail, /expires in 18 days/);
});

test('an expired registration reads as overdue, not as due soon', () => {
  const expired = vehicle({ registrationPermanent: false, registrationExpires: '2026-09-30' });
  const found = collectReminders([expired], ON, NOW).find((i) => i.kind === 'registration');
  assert.equal(found?.severity, 'overdue');
  assert.match(found!.detail, /expired 14 days ago/);
});

test('overdue items sort ahead of approaching ones', () => {
  const mixed = vehicle({
    registrationPermanent: false,
    registrationExpires: '2026-11-01',
    components: [component({ id: 10, name: 'Engine Oil' })],
  } as Partial<ReminderVehicle>);
  const items = collectReminders([mixed], ON, NOW);
  assert.equal(items[0].severity, 'overdue');
  assert.equal(items[1].severity, 'soon');
});

// ------------------------------------------------------- when to say it again
test('nothing is sent while reminders are off', () => {
  const items = collectReminders([vehicle()], ON, NOW);
  const decision = decideSend(items, REMINDER_DEFAULTS, [], null, NOW);
  assert.equal(decision.send, false);
  assert.equal(decision.reason, 'disabled');
});

test('an empty garage sends nothing', () => {
  assert.equal(decideSend([], ON, [], null, NOW).reason, 'nothing_due');
});

test('something newly outstanding is sent', () => {
  const items = collectReminders([vehicle()], ON, NOW);
  const decision = decideSend(items, ON, [], null, NOW);
  assert.equal(decision.send, true);
  assert.equal(decision.reason, 'new_items');
  assert.deepEqual(decision.newKeys, items.map((i) => i.key));
});

test('the same outstanding items are not repeated the next morning', () => {
  // The failure this prevents: a notification every single day until it is
  // muted, after which it protects nothing at all.
  const items = collectReminders([vehicle()], ON, NOW);
  const keys = items.map((i) => i.key);
  const yesterday = new Date(NOW.getTime() - 86_400_000);

  const decision = decideSend(items, ON, keys, yesterday, NOW);
  assert.equal(decision.send, false);
  assert.equal(decision.reason, 'already_reported');
});

test('a still-outstanding item is raised again after the repeat window', () => {
  const items = collectReminders([vehicle()], ON, NOW);
  const keys = items.map((i) => i.key);
  const longAgo = new Date(NOW.getTime() - 8 * 86_400_000);

  const decision = decideSend(items, ON, keys, longAgo, NOW);
  assert.equal(decision.send, true);
  assert.equal(decision.reason, 'repeat_due');
});

test('a component getting worse counts as news', () => {
  // Severity is part of the key, so crossing from approaching to overdue is a
  // new fact rather than the same one already reported.
  const approaching = vehicle({
    components: [component({ id: 10, name: 'Engine Oil', lastOdometer: 47_000 })],
  } as Partial<ReminderVehicle>);
  const soonKeys = collectReminders([approaching], ON, NOW).map((i) => i.key);

  const nowOverdue = collectReminders([vehicle()], ON, NOW);
  const decision = decideSend(nowOverdue, ON, soonKeys, new Date(NOW.getTime() - 3600_000), NOW);

  assert.equal(decision.send, true, 'an escalation must not be suppressed as already reported');
  assert.equal(decision.reason, 'new_items');
});

// -------------------------------------------------------------------- digest
test('the digest leads with the count and groups by vehicle', () => {
  const items = collectReminders(
    [
      vehicle({ registrationPermanent: false, registrationExpires: '2026-11-01' }),
      vehicle({ id: 2, name: '1957 Chevrolet Bel Air' }),
    ],
    ON,
    NOW,
  );
  const digest = formatDigest(items, 'The Garage');

  assert.match(digest.title, /^The Garage: 2 overdue, 1 due soon$/);
  assert.match(digest.message, /1949 Plymouth Special Deluxe/);
  assert.match(digest.message, /1957 Chevrolet Bel Air/);
  assert.match(digest.message, /! Engine Oil/);
  assert.match(digest.message, /- Registration/);
});

// ------------------------------------------------------------------ settings
test('settings fall back rather than throwing on nonsense', () => {
  const parsed = readReminderSettings({
    'reminders.enabled': 'yes',
    'reminders.hour': 'half past nine',
    'reminders.leadDays': '-5',
    'reminders.repeatDays': '9999',
  });
  assert.equal(parsed.enabled, true);
  assert.equal(parsed.hour, REMINDER_DEFAULTS.hour, 'unparseable falls back');
  assert.equal(parsed.leadDays, 0, 'clamped to the floor');
  assert.equal(parsed.repeatDays, 90, 'clamped to the ceiling');
});

test('reminders are off until switched on', () => {
  assert.equal(readReminderSettings({}).enabled, false);
});

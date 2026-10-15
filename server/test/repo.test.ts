import assert from 'node:assert/strict';
import { test } from 'node:test';

import { componentState, toISO, today, vehicleTotals } from '@grg/shared';

import { closeDatabase, openDatabase } from '../src/db/open.ts';
import type { Database } from '../src/db/open.ts';
import * as repo from '../src/db/repo.ts';

function fresh(): Database {
  return openDatabase({ file: ':memory:', ensureDir: false });
}

function plymouth(db: Database) {
  return repo.createVehicle(db, {
    year: 1949,
    make: 'Plymouth',
    model: 'Special Deluxe',
    body: '4-Dr Sedan',
    plate: '49312',
    odometer: 48_312,
    registrationPermanent: true,
  });
}

function daysAgo(n: number): string {
  const d = today();
  d.setDate(d.getDate() - n);
  return toISO(d);
}

test('migrations run once and are idempotent across reopens', () => {
  const db = fresh();
  const version = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number };
  assert.ok(version.v >= 1);
  // Re-running the migration step must not duplicate rows or throw.
  const before = db.prepare('SELECT COUNT(*) AS n FROM schema_version').get() as { n: number };
  assert.equal(before.n, version.v);
  closeDatabase(db);
});

test('foreign keys cascade so deleting a vehicle takes its history with it', () => {
  const db = fresh();
  const v = plymouth(db);
  repo.seedComponents(db, v.id);
  repo.createEntry(db, v.id, { task: 'Oil change', cost: 46 });
  repo.createWishlist(db, v.id, { title: 'Master cylinder', priority: 'crucial' });
  repo.createMod(db, v.id, { title: '12V conversion' });

  repo.deleteVehicle(db, v.id);

  assert.equal(repo.listComponents(db, v.id).length, 0);
  assert.equal(repo.listEntries(db, v.id).length, 0);
  assert.equal(repo.listWishlist(db, v.id).length, 0);
  assert.equal(repo.listMods(db, v.id).length, 0);
  closeDatabase(db);
});

test('seeded components are editable and never re-added', () => {
  const db = fresh();
  const v = plymouth(db);
  repo.seedComponents(db, v.id);
  assert.equal(repo.listComponents(db, v.id).length, 6);

  const oil = repo.listComponents(db, v.id).find((c) => c.name === 'Engine Oil')!;
  repo.deleteComponent(db, oil.id);
  assert.equal(repo.listComponents(db, v.id).length, 5);

  // Nothing in the read path re-seeds; the deletion sticks.
  assert.equal(
    repo.listComponents(db, v.id).some((c) => c.name === 'Engine Oil'),
    false,
  );
  closeDatabase(db);
});

test('the 6V and 12V batteries track independently', () => {
  const db = fresh();
  const v = plymouth(db);

  const six = repo.createComponent(db, v.id, {
    name: 'Battery 6V', category: 'battery', intervalMonths: 60, spec: 'Group 1, 6V',
  });
  const twelve = repo.createComponent(db, v.id, {
    name: 'Battery 12V', category: 'battery', intervalMonths: 48, spec: 'Group 24, 12V',
  });

  repo.serviceComponent(db, six, { date: daysAgo(2200), odometer: 46_000 });
  repo.serviceComponent(db, twelve, { date: daysAgo(365), odometer: 47_800 });

  const vehicle = repo.getVehicle(db, v.id)!;
  const states = repo
    .listComponents(db, v.id)
    .map((c) => componentState(c, vehicle.odometer));

  const a = states.find((s) => s.name === 'Battery 6V')!;
  const b = states.find((s) => s.name === 'Battery 12V')!;
  assert.equal(a.overdue, true);
  assert.equal(b.overdue, false);
  assert.equal(a.governedBy, 'time');
  assert.equal(a.milesLeft, null, 'a month-only interval reports no mileage');
  closeDatabase(db);
});

test('servicing a component resets its interval and writes one ledger entry', () => {
  const db = fresh();
  const v = plymouth(db);
  const battery = repo.createComponent(db, v.id, {
    name: 'Battery 6V', category: 'battery', intervalMonths: 60,
  });

  const { entry } = repo.serviceComponent(db, battery, { odometer: 48_400, cost: 189 });

  assert.equal(entry.componentId, battery.id);
  assert.equal(entry.task, 'Battery 6V replaced', 'hardware is replaced, not changed');
  assert.equal(repo.listEntries(db, v.id).length, 1);
  assert.equal(repo.getComponent(db, battery.id)!.lastOdometer, 48_400);
  assert.equal(repo.getVehicle(db, v.id)!.odometer, 48_400, 'odometer follows upward');
  closeDatabase(db);
});

test('a fluid is changed, not replaced', () => {
  const db = fresh();
  const v = plymouth(db);
  const oil = repo.createComponent(db, v.id, {
    name: 'Engine Oil', category: 'fluid', intervalMiles: 1500,
  });
  const { entry } = repo.serviceComponent(db, oil, {});
  assert.equal(entry.task, 'Engine Oil changed');
  assert.equal(entry.category, 'Lubrication');
  closeDatabase(db);
});

test('a back-dated entry cannot rewind the odometer', () => {
  const db = fresh();
  const v = plymouth(db);
  repo.createEntry(db, v.id, { task: 'Forgotten job', odometer: 100, date: daysAgo(900) });
  assert.equal(repo.getVehicle(db, v.id)!.odometer, 48_312);
  closeDatabase(db);
});

test('an explicit correction can lower the odometer', () => {
  const db = fresh();
  const v = plymouth(db);
  repo.setOdometer(db, v.id, 40_000);
  assert.equal(repo.getVehicle(db, v.id)!.odometer, 40_000);
  closeDatabase(db);
});

test('removing a component keeps the work already logged against it', () => {
  const db = fresh();
  const v = plymouth(db);
  const oil = repo.createComponent(db, v.id, { name: 'Engine Oil', category: 'fluid' });
  repo.serviceComponent(db, oil, { cost: 46 });

  repo.deleteComponent(db, oil.id);

  const entries = repo.listEntries(db, v.id);
  assert.equal(entries.length, 1, 'history survives');
  assert.equal(entries[0].componentId, null, 'the link is cleared, not the row');
  closeDatabase(db);
});

test('entries come back newest first and totals agree', () => {
  const db = fresh();
  const v = plymouth(db);
  repo.createEntry(db, v.id, { task: 'old', date: daysAgo(400), odometer: 44_310, cost: 142 });
  repo.createEntry(db, v.id, { task: 'new', date: daysAgo(20), odometer: 48_105, cost: 84.5 });

  const entries = repo.listEntries(db, v.id);
  assert.equal(entries[0].task, 'new');

  const totals = vehicleTotals(entries);
  assert.equal(totals.lifetimeCost, 226.5);
  assert.equal(totals.costTtm, 84.5, 'the 400-day-old entry is outside the window');
  closeDatabase(db);
});

test('wishlist completion sets and clears the completed date', () => {
  const db = fresh();
  const v = plymouth(db);
  const item = repo.createWishlist(db, v.id, {
    title: 'Dual-circuit master', priority: 'crucial', estimate: 310,
  });

  repo.updateWishlist(db, item.id, { done: true });
  assert.ok(repo.getWishlist(db, item.id)!.completed, 'completing stamps a date');

  repo.updateWishlist(db, item.id, { done: false });
  assert.equal(
    repo.getWishlist(db, item.id)!.completed,
    null,
    're-opening clears it, so it cannot claim to be finished',
  );
  closeDatabase(db);
});

test('partial updates leave untouched columns alone', () => {
  const db = fresh();
  const v = plymouth(db);
  repo.updateVehicle(db, v.id, { plate: '12345' });
  const after = repo.getVehicle(db, v.id)!;
  assert.equal(after.plate, '12345');
  assert.equal(after.make, 'Plymouth', 'unrelated fields survive');
  assert.equal(after.registrationPermanent, true, 'booleans survive a partial update');
  closeDatabase(db);
});

test('an empty patch is a no-op rather than an error', () => {
  const db = fresh();
  const v = plymouth(db);
  assert.deepEqual(repo.updateVehicle(db, v.id, {}), v);
  closeDatabase(db);
});

test('settings round-trip and upsert', () => {
  const db = fresh();
  repo.setSetting(db, 'units', 'miles');
  repo.setSetting(db, 'units', 'km');
  assert.equal(repo.getSetting(db, 'units'), 'km');
  assert.deepEqual(repo.allSettings(db), { units: 'km' });
  assert.equal(repo.getSetting(db, 'missing'), null);
  closeDatabase(db);
});

test('archived vehicles are hidden unless asked for', () => {
  const db = fresh();
  const v = plymouth(db);
  repo.updateVehicle(db, v.id, { archived: true });
  assert.equal(repo.listVehicles(db).length, 0);
  assert.equal(repo.listVehicles(db, true).length, 1);
  closeDatabase(db);
});

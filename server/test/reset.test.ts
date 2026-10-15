/**
 * Resets, at both levels: one vehicle from inside the app, and the whole
 * garage from the add-on's configuration page.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { closeDatabase, openDatabase } from '../src/db/open.ts';
import type { Database } from '../src/db/open.ts';
import * as repo from '../src/db/repo.ts';
import { runFactoryResetIfRequested } from '../src/ha/factory-reset.ts';
import type { AddonOptions } from '../src/ha/options.ts';
import { readAddonOptions } from '../src/ha/options.ts';

function garage(): { db: Database; vehicleId: number } {
  const db = openDatabase({ file: ':memory:', ensureDir: false });
  const vehicle = repo.createVehicle(db, {
    year: 1949, make: 'Plymouth', model: 'Special Deluxe', odometer: 48_312,
  });
  repo.seedComponents(db, vehicle.id);
  const oil = repo.listComponents(db, vehicle.id)[0];
  repo.serviceComponent(db, oil, { odometer: 48_000, cost: 46 });
  repo.createEntry(db, vehicle.id, { task: 'Rebuilt carburetor', cost: 84.5 });
  repo.createWishlist(db, vehicle.id, { title: 'Master cylinder', priority: 'crucial' });
  repo.createMod(db, vehicle.id, { title: '12V conversion', cost: 485 });
  return { db, vehicleId: vehicle.id };
}

const options = (over: Partial<AddonOptions> = {}): AddonOptions => ({
  sensorPrefix: 'garage',
  notifyService: '',
  factoryReset: false,
  ...over,
});

// ------------------------------------------------------------- vehicle reset
test('an empty reset request changes nothing', () => {
  const { db, vehicleId } = garage();
  repo.resetVehicle(db, vehicleId, {});
  assert.equal(repo.listEntries(db, vehicleId).length, 2);
  assert.equal(repo.listComponents(db, vehicleId).length, 6);
  assert.equal(repo.listWishlist(db, vehicleId).length, 1);
  closeDatabase(db);
});

test('clearing the log also clears every component last-serviced mark', () => {
  const { db, vehicleId } = garage();
  const before = repo.listComponents(db, vehicleId).find((c) => c.lastDate !== null);
  assert.ok(before, 'the fixture serviced a component');

  repo.resetVehicle(db, vehicleId, { log: true });

  assert.equal(repo.listEntries(db, vehicleId).length, 0);
  assert.equal(
    repo.listComponents(db, vehicleId).every((c) => c.lastDate === null && c.lastOdometer === null),
    true,
    'a gauge must not count down from a service that no longer exists',
  );
  closeDatabase(db);
});

test('components survive a log reset unless asked for', () => {
  const { db, vehicleId } = garage();
  repo.resetVehicle(db, vehicleId, { log: true });
  assert.equal(repo.listComponents(db, vehicleId).length, 6, 'the specs are still the car\'s');
  closeDatabase(db);
});

test('reseed replaces the component list with the defaults', () => {
  const { db, vehicleId } = garage();
  repo.createComponent(db, vehicleId, { name: 'Battery 6V', category: 'battery' });
  assert.equal(repo.listComponents(db, vehicleId).length, 7);

  repo.resetVehicle(db, vehicleId, { components: 'reseed' });

  const after = repo.listComponents(db, vehicleId);
  assert.equal(after.length, 6);
  assert.equal(after.some((c) => c.name === 'Battery 6V'), false, 'the custom one is gone');
  closeDatabase(db);
});

test('clear leaves the vehicle with no components at all', () => {
  const { db, vehicleId } = garage();
  repo.resetVehicle(db, vehicleId, { components: 'clear' });
  assert.equal(repo.listComponents(db, vehicleId).length, 0);
  closeDatabase(db);
});

test('a reset can set the odometer for a replaced unit', () => {
  const { db, vehicleId } = garage();
  repo.resetVehicle(db, vehicleId, { log: true, odometer: 0 });
  assert.equal(repo.getVehicle(db, vehicleId)!.odometer, 0);
  closeDatabase(db);
});

test('resetting an unknown vehicle reports rather than throws', () => {
  const db = openDatabase({ file: ':memory:', ensureDir: false });
  assert.equal(repo.resetVehicle(db, 999, { log: true }), null);
  closeDatabase(db);
});

test('the whole garage empties but settings survive', () => {
  const { db } = garage();
  repo.setSetting(db, 'units', 'miles');

  const result = repo.resetGarage(db);

  assert.equal(result.vehicles, 1);
  assert.equal(repo.listVehicles(db, true).length, 0);
  assert.equal(repo.getSetting(db, 'units'), 'miles', 'preferences are about the owner');
  closeDatabase(db);
});

// ------------------------------------------------------------ options.json
test('a missing options file is the ordinary laptop case', () => {
  const parsed = readAddonOptions('/definitely/not/here.json', {
    sensorPrefix: 'garage', notifyService: '',
  });
  assert.deepEqual(parsed, { sensorPrefix: 'garage', notifyService: '', factoryReset: false });
});

test('factory_reset is only true when it is literally true', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grg-opt-'));
  const file = path.join(dir, 'options.json');

  for (const [written, expected] of [
    ['true', true], ['"true"', false], ['1', false], ['false', false], ['null', false],
  ] as const) {
    fs.writeFileSync(file, `{"factory_reset": ${written}}`);
    assert.equal(
      readAddonOptions(file, { sensorPrefix: 'garage', notifyService: '' }).factoryReset,
      expected,
      `factory_reset: ${written}`,
    );
  }

  fs.writeFileSync(file, '{ not json');
  assert.equal(
    readAddonOptions(file, { sensorPrefix: 'g', notifyService: '' }).sensorPrefix,
    'g',
    'malformed options fall back rather than crash the add-on',
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------- factory reset
test('nothing happens when the flag is not set', async () => {
  const { db } = garage();
  const outcome = await runFactoryResetIfRequested({
    db, options: options(), supervisorUrl: 'http://supervisor', token: 'tok',
    clearFlag: async () => assert.fail('must not clear a flag that is not set'),
    log: () => {},
  });
  assert.deepEqual(outcome, { performed: false, reason: 'not_requested' });
  assert.equal(repo.listVehicles(db).length, 1);
  closeDatabase(db);
});

test('the flag is cleared BEFORE anything is deleted', async () => {
  const { db } = garage();
  const order: string[] = [];

  await runFactoryResetIfRequested({
    db,
    options: options({ factoryReset: true }),
    supervisorUrl: 'http://supervisor',
    token: 'tok',
    clearFlag: async () => {
      order.push('cleared');
      assert.equal(repo.listVehicles(db).length, 1, 'still intact at clear time');
    },
    log: () => order.push('logged'),
  });

  assert.equal(order[0], 'cleared', 'clearing must come first');
  assert.equal(repo.listVehicles(db).length, 0);
  closeDatabase(db);
});

test('a failed clear deletes nothing, so a reset cannot loop forever', async () => {
  const { db } = garage();
  const outcome = await runFactoryResetIfRequested({
    db,
    options: options({ factoryReset: true }),
    supervisorUrl: 'http://supervisor',
    token: 'tok',
    clearFlag: async () => {
      throw new Error('Supervisor said no');
    },
    log: () => {},
  });

  assert.deepEqual(outcome, { performed: false, reason: 'clear_failed' });
  assert.equal(repo.listVehicles(db).length, 1, 'the garage is untouched');
  closeDatabase(db);
});

test('without Supervisor the flag is refused rather than honoured', async () => {
  const { db } = garage();
  const outcome = await runFactoryResetIfRequested({
    db,
    options: options({ factoryReset: true }),
    supervisorUrl: 'http://supervisor',
    token: null,
    log: () => {},
  });

  assert.deepEqual(outcome, { performed: false, reason: 'no_supervisor' });
  assert.equal(repo.listVehicles(db).length, 1);
  closeDatabase(db);
});

test('the cleared options keep the installer\'s other settings', async () => {
  const { db } = garage();
  let sent: AddonOptions | null = null;

  await runFactoryResetIfRequested({
    db,
    options: options({ factoryReset: true, sensorPrefix: 'barn', notifyService: 'notify.phone' }),
    supervisorUrl: 'http://supervisor',
    token: 'tok',
    clearFlag: async (_url, _token, current) => {
      sent = current;
    },
    log: () => {},
  });

  assert.equal(sent!.sensorPrefix, 'barn');
  assert.equal(sent!.notifyService, 'notify.phone');
  closeDatabase(db);
});

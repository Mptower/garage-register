/**
 * Drives the API over a real socket, against a throwaway database.
 */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';

import { createApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { closeDatabase, openDatabase } from '../src/db/open.ts';
import type { Database } from '../src/db/open.ts';

let db: Database;
let base: string;
let server: ReturnType<ReturnType<typeof createApp>['app']['listen']>;

before(async () => {
  db = openDatabase({ file: ':memory:', ensureDir: false });
  const config = loadConfig({ NODE_ENV: 'test', SERVE_CLIENT: 'false', BASE_PATH: '/' });
  const { app } = createApp({ db, config });
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

after(() => {
  server?.close();
  closeDatabase(db);
});

async function call(method: string, path: string, payload?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: payload === undefined ? {} : { 'content-type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function newVehicle(extra: Record<string, unknown> = {}) {
  const res = await call('POST', '/vehicles', {
    year: 1949, make: 'Plymouth', model: 'Special Deluxe', odometer: 48_312, ...extra,
  });
  assert.equal(res.status, 201);
  return res.body;
}

test('health and meta answer', async () => {
  assert.equal((await call('GET', '/health')).body.ok, true);
  const meta = (await call('GET', '/meta')).body;
  assert.ok(meta.componentCategories.includes('battery'));
  assert.equal(meta.homeAssistant.available, false, 'no Supervisor in tests');
});

test('creating a vehicle seeds the usual components', async () => {
  const vehicle = await newVehicle();
  const components = (await call('GET', `/vehicles/${vehicle.id}/components`)).body;
  assert.equal(components.length, 6);
  assert.ok(components.every((c: { tracked: boolean }) => c.tracked));
});

test('seeding can be declined for a vehicle that needs nothing standard', async () => {
  const vehicle = await newVehicle({ seedComponents: false });
  assert.equal((await call('GET', `/vehicles/${vehicle.id}/components`)).body.length, 0);
});

test('the vehicle payload carries everything one screen needs', async () => {
  const vehicle = await newVehicle();
  const { body } = await call('GET', `/vehicles/${vehicle.id}`);
  for (const key of [
    'vehicle', 'components', 'entries', 'wishlist', 'modifications',
    'totals', 'wishlistSummary', 'renewals',
  ]) {
    assert.ok(key in body, `missing ${key}`);
  }
});

test('a permanent plate counts down to nothing', async () => {
  const vehicle = await newVehicle({ registrationPermanent: true });
  const { body } = await call('GET', `/vehicles/${vehicle.id}`);
  assert.deepEqual(body.renewals.registration, { permanent: true, days: null });
});

test('a dated registration reports days remaining', async () => {
  const future = new Date();
  future.setDate(future.getDate() + 30);
  const iso = future.toISOString().slice(0, 10);
  const vehicle = await newVehicle({ registrationExpires: iso });
  const { body } = await call('GET', `/vehicles/${vehicle.id}`);
  assert.equal(body.renewals.registration.permanent, false);
  assert.ok(Math.abs(body.renewals.registration.days - 30) <= 1);
});

test('two batteries are tracked separately through the API', async () => {
  const vehicle = await newVehicle({ seedComponents: false });

  const six = (await call('POST', `/vehicles/${vehicle.id}/components`, {
    name: 'Battery 6V', category: 'battery', intervalMonths: 60, spec: 'Group 1',
  })).body;
  const twelve = (await call('POST', `/vehicles/${vehicle.id}/components`, {
    name: 'Battery 12V', category: 'battery', intervalMonths: 48, spec: 'Group 24',
  })).body;

  const old = new Date(); old.setFullYear(old.getFullYear() - 6);
  const recent = new Date(); recent.setFullYear(recent.getFullYear() - 1);

  await call('POST', `/components/${six.componentId}/service`, {
    date: old.toISOString().slice(0, 10),
  });
  await call('POST', `/components/${twelve.componentId}/service`, {
    date: recent.toISOString().slice(0, 10),
  });

  const states = (await call('GET', `/vehicles/${vehicle.id}/components`)).body;
  const a = states.find((s: { name: string }) => s.name === 'Battery 6V');
  const b = states.find((s: { name: string }) => s.name === 'Battery 12V');
  assert.equal(a.overdue, true);
  assert.equal(b.overdue, false);
});

test('servicing a component also writes the ledger entry', async () => {
  const vehicle = await newVehicle({ seedComponents: false });
  const comp = (await call('POST', `/vehicles/${vehicle.id}/components`, {
    name: 'Engine Oil', category: 'fluid', intervalMiles: 1500,
  })).body;

  const res = await call('POST', `/components/${comp.componentId}/service`, {
    odometer: 48_400, cost: 46,
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.entry.task, 'Engine Oil changed');

  const entries = (await call('GET', `/vehicles/${vehicle.id}/entries`)).body;
  assert.equal(entries.length, 1);
});

test('ledger entries can be corrected and deleted', async () => {
  const vehicle = await newVehicle();
  const entry = (await call('POST', `/vehicles/${vehicle.id}/entries`, {
    task: 'Rebuilt carburetor', cost: 84.5,
  })).body;

  const patched = (await call('PATCH', `/entries/${entry.id}`, { cost: 92 })).body;
  assert.equal(patched.cost, 92);
  assert.equal(patched.task, 'Rebuilt carburetor', 'untouched fields survive');

  assert.equal((await call('DELETE', `/entries/${entry.id}`)).status, 204);
  assert.equal((await call('PATCH', `/entries/${entry.id}`, { cost: 1 })).status, 404);
});

test('wishlist items complete and re-open', async () => {
  const vehicle = await newVehicle();
  const item = (await call('POST', `/vehicles/${vehicle.id}/wishlist`, {
    title: 'Dual-circuit master', priority: 'crucial', estimate: 310,
  })).body;

  assert.ok((await call('PATCH', `/wishlist/${item.id}`, { done: true })).body.completed);
  assert.equal(
    (await call('PATCH', `/wishlist/${item.id}`, { done: false })).body.completed,
    null,
  );
});

test('an explicit odometer correction may lower the reading', async () => {
  const vehicle = await newVehicle();
  const res = await call('PUT', `/vehicles/${vehicle.id}/odometer`, { odometer: 40_000 });
  assert.equal(res.body.odometer, 40_000);
});

test('a back-dated entry does not rewind the odometer', async () => {
  const vehicle = await newVehicle();
  await call('POST', `/vehicles/${vehicle.id}/entries`, {
    task: 'Forgotten job', odometer: 100, date: '2019-01-01',
  });
  const { body } = await call('GET', `/vehicles/${vehicle.id}`);
  assert.equal(body.vehicle.odometer, 48_312);
});

// ------------------------------------------------------------------ validation
test('bad input is rejected with a reason, not a 500', async () => {
  const vehicle = await newVehicle();

  const cases: [string, string, unknown, string][] = [
    ['POST', '/vehicles', { make: 'X' }, 'model is required'],
    ['POST', `/vehicles/${vehicle.id}/entries`, { task: '' }, 'task is required'],
    ['POST', `/vehicles/${vehicle.id}/entries`, { task: 'x', date: '11-10-2026' }, 'YYYY-MM-DD'],
    ['POST', `/vehicles/${vehicle.id}/components`, { name: 'x', category: 'nope' }, 'one of'],
    ['POST', `/vehicles/${vehicle.id}/wishlist`, { title: 'x', priority: 'urgent' }, 'one of'],
    ['PATCH', `/vehicles/${vehicle.id}`, { year: 1500 }, 'between'],
    ['PATCH', `/vehicles/${vehicle.id}`, { archived: 'yes' }, 'true or false'],
  ];

  for (const [method, path, payload, needle] of cases) {
    const res = await call(method, path, payload);
    assert.equal(res.status, 400, `${method} ${path} should be rejected`);
    assert.match(res.body.error.message, new RegExp(needle, 'i'));
  }
});

test('unknown ids are 404, not 500', async () => {
  for (const path of ['/vehicles/9999', '/components/9999', '/entries/9999']) {
    assert.equal((await call('GET', '/vehicles/9999')).status, 404, path);
  }
  assert.equal((await call('DELETE', '/components/9999')).status, 404);
  assert.equal((await call('PATCH', '/modifications/9999', { title: 'x' })).status, 404);
});

test('a non-numeric id is a bad request rather than a lookup', async () => {
  assert.equal((await call('GET', '/vehicles/abc')).status, 400);
});

test('deleting a vehicle takes its history with it', async () => {
  const vehicle = await newVehicle();
  await call('POST', `/vehicles/${vehicle.id}/entries`, { task: 'Something' });
  assert.equal((await call('DELETE', `/vehicles/${vehicle.id}`)).status, 204);
  assert.equal((await call('GET', `/vehicles/${vehicle.id}`)).status, 404);
});

test('the list view carries the counts the plates need', async () => {
  const vehicle = await newVehicle({ seedComponents: false });
  await call('POST', `/vehicles/${vehicle.id}/components`, {
    name: 'Old Oil', category: 'fluid', intervalMonths: 6, lastDate: '2020-01-01',
  });
  const list = (await call('GET', '/vehicles')).body;
  const row = list.find((v: { id: number }) => v.id === vehicle.id);
  assert.equal(row.overdueCount, 1);
  assert.equal(typeof row.openWishlist, 'number');
});

test('settings round-trip through the app, not add-on options', async () => {
  await call('PUT', '/settings', { units: 'miles', remindDaysAhead: '30' });
  const settings = (await call('GET', '/settings')).body;
  assert.equal(settings.units, 'miles');
  assert.equal(settings.remindDaysAhead, '30');
});

test('the Home Assistant bridge reports absence rather than failing', async () => {
  const res = await call('POST', '/homeassistant/publish');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { published: 0, available: false });
});

test('malformed JSON is a 400, not a 500 with a stack trace', async () => {
  const res = await fetch(`${base}/vehicles`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"make": "Plymouth",}',
  });
  const payload = (await res.json()) as { error: { code: string; message: string } };
  assert.equal(res.status, 400);
  assert.equal(payload.error.code, 'invalid_json');
  assert.doesNotMatch(payload.error.message, /body-parser|node_modules/, 'no internals leak');
});

test('an oversized body is refused with 413 rather than buffered', async () => {
  const res = await fetch(`${base}/vehicles`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ make: 'P', model: 'D', note: 'x'.repeat(400_000) }),
  });
  assert.equal(res.status, 413);
  assert.equal(((await res.json()) as { error: { code: string } }).error.code, 'payload_too_large');
});

test('a body that is not an object is rejected by name', async () => {
  const res = await call('POST', '/vehicles', ['not', 'an', 'object']);
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /JSON object/i);
});

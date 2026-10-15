import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  addMonths,
  componentState,
  daysUntil,
  monthsBetween,
  parseDate,
  sortEntries,
  toISO,
  vehicleTotals,
  wishlistSummary,
} from '../src/domain.ts';
import type { Component, ServiceEntry, WishlistItem } from '../src/types.ts';

const d = (iso: string) => parseDate(iso)!;

function component(over: Partial<Component> = {}): Component {
  return {
    id: 1,
    vehicleId: 1,
    name: 'Engine Oil',
    category: 'fluid',
    icon: 'Droplet',
    spec: '',
    qty: 1,
    intervalMiles: 1500,
    intervalMonths: 6,
    lastDate: null,
    lastOdometer: null,
    notes: '',
    ...over,
  };
}

function entry(over: Partial<ServiceEntry> = {}): ServiceEntry {
  return {
    id: 1,
    vehicleId: 1,
    date: '2026-01-01',
    odometer: 1000,
    category: 'Other',
    task: 'task',
    parts: '',
    cost: 0,
    note: '',
    componentId: null,
    ...over,
  };
}

// ---------------------------------------------------------------- month maths
test('monthsBetween anchors on the monthiversary, not a flat 30-day month', () => {
  // The naive implementation returned 5.37 here, making every time-governed
  // component read ~10 % younger than it really is.
  assert.ok(Math.abs(monthsBetween(d('2026-04-12'), d('2026-10-11')) - 5.967) < 0.01);
});

test('monthsBetween handles short months and leap days', () => {
  assert.equal(monthsBetween(d('2026-01-31'), d('2026-02-28')), 1);
  assert.equal(monthsBetween(d('2026-01-31'), d('2026-03-31')), 2);
  assert.equal(monthsBetween(d('2024-02-29'), d('2025-02-28')), 12);
  assert.equal(monthsBetween(d('2025-12-15'), d('2026-01-15')), 1);
});

test('monthsBetween clamps to zero and never goes backwards', () => {
  assert.equal(monthsBetween(d('2026-05-10'), d('2026-05-10')), 0);
  assert.equal(monthsBetween(d('2026-06-01'), d('2026-05-01')), 0);

  let previous = -1;
  const start = d('2026-01-31');
  for (let i = 0; i < 400; i += 1) {
    const end = new Date(start);
    end.setDate(end.getDate() + i);
    const value = monthsBetween(start, end);
    assert.ok(value >= previous - 1e-9, `not monotonic at day ${i}`);
    previous = value;
  }
});

test('addMonths clamps onto shorter months', () => {
  assert.equal(toISO(addMonths(d('2026-01-31'), 1)), '2026-02-28');
  assert.equal(toISO(addMonths(d('2024-01-31'), 1)), '2024-02-29');
  assert.equal(toISO(addMonths(d('2026-12-15'), 1)), '2027-01-15');
  assert.equal(toISO(addMonths(d('2026-03-15'), -1)), '2026-02-15');
});

test('parseDate reads ISO as local midnight, not UTC', () => {
  const parsed = parseDate('2026-01-01')!;
  assert.equal(parsed.getFullYear(), 2026);
  assert.equal(parsed.getMonth(), 0);
  assert.equal(parsed.getDate(), 1);
  assert.equal(parseDate('nonsense'), null);
  assert.equal(parseDate(null), null);
});

// -------------------------------------------------------------- component life
test('an untracked component is never overdue', () => {
  const state = componentState(
    component({ intervalMiles: 0, intervalMonths: 0, lastDate: '2020-01-01' }),
    90_000,
  );
  assert.equal(state.tracked, false);
  assert.equal(state.overdue, false);
  assert.equal(state.usedPct, null);
});

test('a never-serviced component has no baseline to measure from', () => {
  const state = componentState(component(), 50_000);
  assert.equal(state.known, false);
  assert.equal(state.overdue, false);
});

test('mileage governs when it is further through than time', () => {
  const state = componentState(
    component({ lastDate: toISO(d('2026-09-11')), lastOdometer: 45_110 }),
    48_312,
    d('2026-10-11'),
  );
  assert.equal(state.milesSince, 3202);
  assert.equal(state.governedBy, 'mileage');
  assert.equal(state.overdue, true);
  assert.equal(state.usedPct, 100, 'display value is clamped');
  assert.ok(state.rawPct! > 200, 'raw value stays uncapped for ranking');
});

test('time governs a barely-driven car', () => {
  const state = componentState(
    component({
      name: 'Brake Fluid',
      intervalMiles: 24_000,
      intervalMonths: 24,
      lastDate: '2024-08-01',
      lastOdometer: 48_300,
    }),
    48_312,
    d('2026-10-11'),
  );
  assert.equal(state.governedBy, 'time');
  assert.equal(state.overdue, true);
  assert.ok(state.milesLeft! > 0, 'plenty of miles left, yet still due');
});

test('dueSoon covers 85-100 % and stops short of overdue', () => {
  const state = componentState(
    component({
      name: 'Chassis Grease',
      intervalMiles: 1000,
      intervalMonths: 12,
      lastDate: toISO(d('2026-10-06')),
      lastOdometer: 47_412,
    }),
    48_312,
    d('2026-10-11'),
  );
  assert.equal(state.usedPct, 90);
  assert.equal(state.dueSoon, true);
  assert.equal(state.overdue, false);
});

test('a component with only a month interval reports no mileage remaining', () => {
  const state = componentState(
    component({ intervalMiles: 0, intervalMonths: 12, lastDate: '2026-04-11' }),
    48_312,
    d('2026-10-11'),
  );
  assert.equal(state.milesLeft, null);
  assert.equal(state.governedBy, 'time');
});

// ------------------------------------------------- the 6 V / 12 V battery case
test('two batteries on one car track independently', () => {
  const sixVolt = component({
    id: 10, name: 'Battery 6V', category: 'battery',
    intervalMiles: 0, intervalMonths: 60,
    lastDate: '2020-10-11', lastOdometer: 46_000,
  });
  const twelveVolt = component({
    id: 11, name: 'Battery 12V', category: 'battery',
    intervalMiles: 0, intervalMonths: 48,
    lastDate: '2025-10-11', lastOdometer: 47_800,
  });

  const a = componentState(sixVolt, 48_312, d('2026-10-11'));
  const b = componentState(twelveVolt, 48_312, d('2026-10-11'));

  assert.equal(a.overdue, true, '6 V is six years old against a 60-month life');
  assert.equal(b.overdue, false, '12 V was fitted a year ago against a 48-month life');
  assert.equal(a.governedBy, 'time');
  assert.equal(b.governedBy, 'time');
  // Neither battery's mileage should leak into the other's reading.
  assert.equal(a.milesLeft, null);
  assert.equal(b.milesLeft, null);
});

// ---------------------------------------------------------------------- ledger
test('totals split lifetime, year-to-date and trailing twelve months', () => {
  const now = d('2026-10-11');
  const totals = vehicleTotals(
    [
      entry({ id: 1, date: '2026-09-21', odometer: 48_105, cost: 84.5 }),
      entry({ id: 2, date: '2025-09-06', odometer: 44_310, cost: 142 }),
      entry({ id: 3, date: '2026-02-01', odometer: 46_000, cost: 10 }),
    ],
    now,
  );
  assert.equal(totals.count, 3);
  assert.equal(totals.lifetimeCost, 236.5);
  assert.equal(totals.costYtd, 94.5, 'only the two 2026 entries');
  assert.equal(totals.costTtm, 94.5, 'the 400-day-old entry falls outside the window');
  assert.equal(totals.daysSinceService, 20);
  assert.equal(totals.costPerMile, round2(236.5 / (48_105 - 44_310)));
});

test('cost per mile needs two readings before it means anything', () => {
  const totals = vehicleTotals([entry({ odometer: 1000, cost: 50 })]);
  assert.equal(totals.costPerMile, null);
});

test('an empty ledger reports nulls rather than zeroes', () => {
  const totals = vehicleTotals([]);
  assert.equal(totals.count, 0);
  assert.equal(totals.lastServiceDate, null);
  assert.equal(totals.daysSinceService, null);
});

test('entries sort newest first, breaking ties on odometer', () => {
  const sorted = sortEntries([
    entry({ id: 1, date: '2026-01-01', odometer: 100 }),
    entry({ id: 2, date: '2026-05-01', odometer: 500 }),
    entry({ id: 3, date: '2026-05-01', odometer: 900 }),
  ]);
  assert.deepEqual(sorted.map((e) => e.id), [3, 2, 1]);
});

// -------------------------------------------------------------------- wishlist
test('wishlist summary counts only open items', () => {
  const items: WishlistItem[] = [
    wish({ id: 1, priority: 'crucial', estimate: 310 }),
    wish({ id: 2, priority: 'mechanical', estimate: 1450 }),
    wish({ id: 3, priority: 'crucial', estimate: 99, done: true }),
  ];
  const summary = wishlistSummary(items);
  assert.equal(summary.open, 2);
  assert.equal(summary.totalEstimate, 1760);
  assert.equal(summary.crucialOpen, 1);
  assert.equal(summary.byPriority.crucial, 310);
  assert.equal(summary.byPriority.cosmetic, 0);
});

// -------------------------------------------------------------------- renewals
test('daysUntil goes negative once a renewal has passed', () => {
  assert.equal(daysUntil('2026-10-21', d('2026-10-11')), 10);
  assert.equal(daysUntil('2026-10-01', d('2026-10-11')), -10);
  assert.equal(daysUntil(null), null);
});

function wish(over: Partial<WishlistItem> = {}): WishlistItem {
  return {
    id: 1, vehicleId: 1, title: 't', detail: '', priority: 'mechanical',
    estimate: 0, done: false, added: '2026-01-01', completed: null, ...over,
  };
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Service-interval arithmetic.
 *
 * A classic is time-driven as much as mileage-driven: a car covering 2,000
 * miles a year degrades its oil by the calendar, not the odometer. So every
 * interval has both a mileage and a month dimension, and whichever is further
 * through governs. Tracking mileage alone gets brake fluid badly wrong.
 */
import type {
  Component,
  ComponentState,
  ServiceEntry,
  VehicleTotals,
  WishlistItem,
  WishlistSummary,
  Priority,
} from './types.ts';

/** Past this fraction of an interval a component is flagged "due soon". */
export const DUE_SOON_FRACTION = 0.85;
export const RENEWAL_WARN_DAYS = 60;

export function today(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Parse an ISO date as *local* midnight. `new Date('2026-01-01')` is UTC. */
export function parseDate(value: string | Date | null | undefined): Date | null {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (typeof value !== 'string' || value.length < 10) return null;
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const parsed = new Date(y, m - 1, d);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function toISO(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/** Shift by whole months, clamping to the end of shorter months. */
export function addMonths(anchor: Date, count: number): Date {
  const total = anchor.getMonth() + count;
  const year = anchor.getFullYear() + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(anchor.getDate(), lastDay));
}

/**
 * Whole months elapsed plus the fraction of the current month.
 *
 * Measured against the monthiversary of `start` rather than a flat 30-day
 * month. The naive version reads 12 Apr -> 11 Oct as 5.37 months instead of
 * 5.97, which makes every time-governed component look ~10 % younger than it
 * is — exactly the wrong direction for brake fluid.
 */
export function monthsBetween(start: Date, end: Date): number {
  if (end <= start) return 0;

  let months =
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  let anchor = addMonths(start, months);
  if (anchor > end) {
    months -= 1;
    anchor = addMonths(start, months);
  }

  const next = addMonths(start, months + 1);
  const span = daysBetween(anchor, next);
  const fraction = span > 0 ? daysBetween(anchor, end) / span : 0;
  return months + fraction;
}

export function componentState(
  component: Component,
  odometer: number,
  now: Date = today(),
): ComponentState {
  const tracked = component.intervalMiles > 0 || component.intervalMonths > 0;
  const last = parseDate(component.lastDate);

  const base = {
    componentId: component.id,
    name: component.name,
    category: component.category,
    icon: component.icon,
    spec: component.spec,
    qty: component.qty,
    notes: component.notes,
    intervalMiles: component.intervalMiles,
    intervalMonths: component.intervalMonths,
    lastDate: component.lastDate,
    lastOdometer: component.lastOdometer,
    tracked,
  };

  if (!tracked || !last) {
    return {
      ...base,
      known: false,
      usedPct: null,
      rawPct: null,
      milesSince: null,
      monthsSince: null,
      milesLeft: null,
      monthsLeft: null,
      governedBy: null,
      overdue: false,
      dueSoon: false,
    };
  }

  const milesSince = Math.max(odometer - (component.lastOdometer ?? 0), 0);
  const monthsSince = monthsBetween(last, now);

  const byMiles = component.intervalMiles > 0 ? milesSince / component.intervalMiles : 0;
  const byTime = component.intervalMonths > 0 ? monthsSince / component.intervalMonths : 0;
  const used = Math.max(byMiles, byTime);

  return {
    ...base,
    known: true,
    usedPct: round(Math.min(used, 1) * 100, 1),
    rawPct: round(used * 100, 1),
    milesSince,
    monthsSince: round(monthsSince, 1),
    milesLeft:
      component.intervalMiles > 0 ? Math.max(component.intervalMiles - milesSince, 0) : null,
    monthsLeft:
      component.intervalMonths > 0
        ? round(Math.max(component.intervalMonths - monthsSince, 0), 1)
        : null,
    governedBy: byMiles >= byTime ? 'mileage' : 'time',
    overdue: used >= 1,
    dueSoon: used >= DUE_SOON_FRACTION && used < 1,
  };
}

export function vehicleTotals(
  entries: readonly ServiceEntry[],
  now: Date = today(),
): VehicleTotals {
  const lifetime = round(entries.reduce((sum, e) => sum + (e.cost || 0), 0), 2);

  const ytd = round(
    entries
      .filter((e) => parseDate(e.date)?.getFullYear() === now.getFullYear())
      .reduce((sum, e) => sum + (e.cost || 0), 0),
    2,
  );

  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 365);
  const ttm = round(
    entries
      .filter((e) => {
        const d = parseDate(e.date);
        return d !== null && d >= cutoff;
      })
      .reduce((sum, e) => sum + (e.cost || 0), 0),
    2,
  );

  const sorted = sortEntries(entries);
  const lastDate = sorted.length > 0 ? parseDate(sorted[0].date) : null;

  const odometers = entries.map((e) => e.odometer || 0).filter((v) => v > 0);
  const span =
    odometers.length > 1 ? Math.max(...odometers) - Math.min(...odometers) : 0;

  return {
    count: entries.length,
    lifetimeCost: lifetime,
    costYtd: ytd,
    costTtm: ttm,
    lastServiceDate: lastDate ? toISO(lastDate) : null,
    daysSinceService: lastDate ? daysBetween(lastDate, now) : null,
    costPerMile: span > 0 ? round(lifetime / span, 2) : null,
  };
}

/** Newest first, breaking date ties by the higher odometer reading. */
export function sortEntries(entries: readonly ServiceEntry[]): ServiceEntry[] {
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (b.odometer || 0) - (a.odometer || 0);
  });
}

export function wishlistSummary(items: readonly WishlistItem[]): WishlistSummary {
  const open = items.filter((i) => !i.done);
  const byPriority = { crucial: 0, mechanical: 0, cosmetic: 0 } as Record<Priority, number>;
  for (const item of open) {
    byPriority[item.priority] = round(byPriority[item.priority] + (item.estimate || 0), 2);
  }
  return {
    open: open.length,
    totalEstimate: round(open.reduce((sum, i) => sum + (i.estimate || 0), 0), 2),
    byPriority,
    crucialOpen: open.filter((i) => i.priority === 'crucial').length,
  };
}

/** Days until a renewal; negative once it has passed. */
export function daysUntil(value: string | null, now: Date = today()): number | null {
  const date = parseDate(value);
  return date ? daysBetween(now, date) : null;
}

export function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

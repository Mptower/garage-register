/**
 * Service-interval arithmetic.
 *
 * A classic is time-driven as much as mileage-driven: a car covering 2,000
 * miles a year degrades its oil by the calendar, not the odometer. So every
 * interval has both a mileage and a month dimension, and whichever is further
 * through governs. Tracking mileage alone gets brake fluid badly wrong.
 */
import type { Component, ComponentState, ServiceEntry, VehicleTotals, WishlistItem, WishlistSummary } from './types.ts';
/** Past this fraction of an interval a component is flagged "due soon". */
export declare const DUE_SOON_FRACTION = 0.85;
export declare const RENEWAL_WARN_DAYS = 60;
export declare function today(): Date;
/** Parse an ISO date as *local* midnight. `new Date('2026-01-01')` is UTC. */
export declare function parseDate(value: string | Date | null | undefined): Date | null;
export declare function toISO(date: Date): string;
export declare function daysBetween(from: Date, to: Date): number;
/** Shift by whole months, clamping to the end of shorter months. */
export declare function addMonths(anchor: Date, count: number): Date;
/**
 * Whole months elapsed plus the fraction of the current month.
 *
 * Measured against the monthiversary of `start` rather than a flat 30-day
 * month. The naive version reads 12 Apr -> 11 Oct as 5.37 months instead of
 * 5.97, which makes every time-governed component look ~10 % younger than it
 * is — exactly the wrong direction for brake fluid.
 */
export declare function monthsBetween(start: Date, end: Date): number;
export declare function componentState(component: Component, odometer: number, now?: Date): ComponentState;
export declare function vehicleTotals(entries: readonly ServiceEntry[], now?: Date): VehicleTotals;
/** Newest first, breaking date ties by the higher odometer reading. */
export declare function sortEntries(entries: readonly ServiceEntry[]): ServiceEntry[];
export declare function wishlistSummary(items: readonly WishlistItem[]): WishlistSummary;
/** Days until a renewal; negative once it has passed. */
export declare function daysUntil(value: string | null, now?: Date): number | null;
export declare function round(value: number, places: number): number;
//# sourceMappingURL=domain.d.ts.map
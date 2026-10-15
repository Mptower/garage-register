/**
 * Publishes a handful of sensors back to Home Assistant.
 *
 * Server-side only: SUPERVISOR_TOKEN never reaches the browser. The app is the
 * source of truth and Home Assistant is a read-only mirror, so nothing here
 * ever reads state back — it would only create a second copy to disagree with.
 *
 * Absence of a Supervisor is normal, not an error. On a laptop there is none,
 * and the app is fully usable without it; `available` simply stays false.
 */
import { componentState, vehicleTotals, wishlistSummary } from '@grg/shared';

import type { Database } from '../db/open.ts';
import * as repo from '../db/repo.ts';

export interface HaOptions {
  token: string | null;
  baseUrl: string;
  sensorPrefix: string;
  notifyService: string;
}

/** Stable, readable entity suffix from a vehicle's name. */
export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'vehicle'
  );
}

interface StatePayload {
  state: string | number;
  attributes: Record<string, unknown>;
}

export class HomeAssistantBridge {
  readonly available: boolean;
  readonly sensorPrefix: string;
  /** False when the installer left notify_service blank; nothing is sent. */
  readonly notifyConfigured: boolean;
  private readonly token: string | null;
  private readonly baseUrl: string;
  private readonly notifyService: string;

  constructor(options: HaOptions) {
    this.token = options.token;
    // Supervisor's root; the Home Assistant core API hangs off /core/api.
    this.baseUrl = `${options.baseUrl.replace(/\/+$/, '')}/core/api`;
    this.sensorPrefix = options.sensorPrefix;
    this.notifyService = options.notifyService;
    this.available = options.token !== null;
    this.notifyConfigured = options.notifyService.trim() !== '';
  }

  private async post(path: string, payload: unknown): Promise<void> {
    if (!this.token) return;
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      // A slow Supervisor must not wedge a request the user is waiting on.
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`Home Assistant ${path} -> ${res.status} ${await res.text()}`);
    }
  }

  private entityId(vehicleSlug: string, suffix: string): string {
    return `sensor.${this.sensorPrefix}_${vehicleSlug}_${suffix}`;
  }

  /** Recomputes and pushes every vehicle's sensors. Safe to call repeatedly. */
  async publishAll(db: Database): Promise<{ published: number }> {
    if (!this.available) return { published: 0 };

    let published = 0;

    for (const vehicle of repo.listVehicles(db)) {
      const slug = slugify(`${vehicle.year}_${vehicle.make}_${vehicle.model}`);
      const components = repo
        .listComponents(db, vehicle.id)
        .map((c) => componentState(c, vehicle.odometer));
      const entries = repo.listEntries(db, vehicle.id);
      const totals = vehicleTotals(entries);
      const wishlist = wishlistSummary(repo.listWishlist(db, vehicle.id));

      const overdue = components.filter((c) => c.overdue);
      const dueSoon = components.filter((c) => c.dueSoon);

      const states: [string, StatePayload][] = [
        [
          'odometer',
          {
            state: vehicle.odometer,
            attributes: {
              friendly_name: `${vehicle.year} ${vehicle.make} ${vehicle.model} odometer`,
              unit_of_measurement: 'mi',
              device_class: 'distance',
              state_class: 'total_increasing',
              icon: 'mdi:speedometer',
              plate: vehicle.plate,
            },
          },
        ],
        [
          'attention',
          {
            // The state is the headline count; the reasons ride along so a
            // notification can say what is wrong without another lookup.
            state: overdue.length + dueSoon.length,
            attributes: {
              friendly_name: `${vehicle.year} ${vehicle.make} ${vehicle.model} needs attention`,
              icon: overdue.length > 0 ? 'mdi:alert-decagram' : 'mdi:check-decagram',
              overdue: overdue.map((c) => c.name),
              due_soon: dueSoon.map((c) => c.name),
              crucial_wishlist_open: wishlist.crucialOpen,
            },
          },
        ],
        [
          'next_due',
          {
            state: nextDueName(components),
            attributes: {
              friendly_name: `${vehicle.year} ${vehicle.make} ${vehicle.model} next service due`,
              icon: 'mdi:wrench-clock',
              ...nextDueAttributes(components),
            },
          },
        ],
        [
          'lifetime_cost',
          {
            state: totals.lifetimeCost,
            attributes: {
              friendly_name: `${vehicle.year} ${vehicle.make} ${vehicle.model} lifetime cost`,
              unit_of_measurement: 'USD',
              device_class: 'monetary',
              icon: 'mdi:cash-multiple',
              cost_ytd: totals.costYtd,
              cost_ttm: totals.costTtm,
              cost_per_mile: totals.costPerMile,
              services_logged: totals.count,
              days_since_service: totals.daysSinceService,
            },
          },
        ],
      ];

      for (const [suffix, payload] of states) {
        await this.post(`/states/${this.entityId(slug, suffix)}`, payload);
        published += 1;
      }
    }

    return { published };
  }

  /** No-op when the installer left notify_service blank. */
  async notify(title: string, message: string): Promise<void> {
    if (!this.available || this.notifyService === '') return;
    const service = this.notifyService.replace(/^notify\./, '');
    await this.post(`/services/notify/${service}`, { title, message });
  }
}

function worst(components: readonly ReturnType<typeof componentState>[]) {
  let candidate: ReturnType<typeof componentState> | null = null;
  for (const state of components) {
    if (!state.known) continue;
    if (candidate === null || (state.rawPct ?? 0) > (candidate.rawPct ?? 0)) {
      candidate = state;
    }
  }
  return candidate;
}

function nextDueName(components: readonly ReturnType<typeof componentState>[]): string {
  return worst(components)?.name ?? 'No history';
}

function nextDueAttributes(
  components: readonly ReturnType<typeof componentState>[],
): Record<string, unknown> {
  const candidate = worst(components);
  if (!candidate) return { status: 'unknown' };
  return {
    used_pct: candidate.usedPct,
    miles_left: candidate.milesLeft,
    months_left: candidate.monthsLeft,
    governed_by: candidate.governedBy,
    overdue: candidate.overdue,
    due_soon: candidate.dueSoon,
  };
}

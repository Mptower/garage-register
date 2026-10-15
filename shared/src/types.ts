/**
 * Domain types.
 *
 * A *component* is anything on the vehicle with a service or replacement life:
 * engine oil, a battery, a set of tyres, a fan belt. Modelling them uniformly
 * is what lets a car carry both a 6 V and a 12 V battery, each tracked on its
 * own interval, without either being a special case.
 */

export type ComponentCategory =
  | 'fluid'
  | 'battery'
  | 'tire'
  | 'filter'
  | 'belt'
  | 'ignition'
  | 'brake'
  | 'other';

export const COMPONENT_CATEGORIES: readonly ComponentCategory[] = [
  'fluid', 'battery', 'tire', 'filter', 'belt', 'ignition', 'brake', 'other',
] as const;

export const CATEGORY_ICON: Record<ComponentCategory, string> = {
  fluid: 'Droplet',
  battery: 'BatteryCharging',
  tire: 'CircleDot',
  filter: 'Filter',
  belt: 'RefreshCw',
  ignition: 'Zap',
  brake: 'Disc',
  other: 'Wrench',
};

export type Priority = 'crucial' | 'mechanical' | 'cosmetic';
export const PRIORITIES: readonly Priority[] = ['crucial', 'mechanical', 'cosmetic'] as const;

export type ModStatus = 'planned' | 'in_progress' | 'installed' | 'removed';
export const MOD_STATUSES: readonly ModStatus[] = [
  'planned', 'in_progress', 'installed', 'removed',
] as const;

export const SERVICE_CATEGORIES = [
  'Lubrication', 'Ignition', 'Fuel System', 'Cooling', 'Brakes', 'Electrical',
  'Chassis', 'Suspension', 'Steering', 'Exhaust', 'Transmission', 'Tires',
  'Body', 'Interior', 'Inspection', 'Other',
] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export interface Vehicle {
  id: number;
  year: number;
  make: string;
  model: string;
  body: string;
  vin: string;
  plate: string;
  plateLegendTop: string;
  plateLegendBottom: string;
  photo: string;
  odometer: number;
  /**
   * Wisconsin Collector plates are permanent and undated. When this is true the
   * expiry is ignored entirely rather than quietly reading as "expired".
   */
  registrationPermanent: boolean;
  registrationExpires: string | null;
  insuranceCarrier: string;
  insuranceRenews: string | null;
  agreedValue: string;
  archived: boolean;
}

export interface Component {
  id: number;
  vehicleId: number;
  name: string;
  category: ComponentCategory;
  icon: string;
  spec: string;
  qty: number;
  /** 0 means "not tracked on this axis". Both 0 means replace-on-failure. */
  intervalMiles: number;
  intervalMonths: number;
  lastDate: string | null;
  lastOdometer: number | null;
  notes: string;
}

export interface ServiceEntry {
  id: number;
  vehicleId: number;
  date: string;
  odometer: number;
  category: ServiceCategory | string;
  task: string;
  parts: string;
  cost: number;
  note: string;
  /** Set when the entry was produced by servicing a component. */
  componentId: number | null;
}

export interface WishlistItem {
  id: number;
  vehicleId: number;
  title: string;
  detail: string;
  priority: Priority;
  estimate: number;
  done: boolean;
  added: string;
  completed: string | null;
}

export interface Modification {
  id: number;
  vehicleId: number;
  title: string;
  detail: string;
  status: ModStatus;
  cost: number;
  date: string;
  reversible: boolean;
}

/** Derived, never stored — recomputed from the odometer and today's date. */
export interface ComponentState {
  componentId: number;
  name: string;
  category: ComponentCategory;
  icon: string;
  spec: string;
  qty: number;
  notes: string;
  intervalMiles: number;
  intervalMonths: number;
  lastDate: string | null;
  lastOdometer: number | null;
  /** False when no interval is set at all — such a component is never "overdue". */
  tracked: boolean;
  /** False until it has been serviced once, so there is a baseline to measure from. */
  known: boolean;
  usedPct: number | null;
  rawPct: number | null;
  milesSince: number | null;
  monthsSince: number | null;
  milesLeft: number | null;
  monthsLeft: number | null;
  governedBy: 'mileage' | 'time' | null;
  overdue: boolean;
  dueSoon: boolean;
}

export interface VehicleTotals {
  count: number;
  lifetimeCost: number;
  costYtd: number;
  costTtm: number;
  lastServiceDate: string | null;
  daysSinceService: number | null;
  costPerMile: number | null;
}

export interface WishlistSummary {
  open: number;
  totalEstimate: number;
  byPriority: Record<Priority, number>;
  crucialOpen: number;
}

export interface ApiError {
  error: { code: string; message: string };
}

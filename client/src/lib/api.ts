/**
 * Thin fetch wrapper over the add-on's REST API.
 *
 * Every path here is *relative* ("api/vehicles", never "/api/vehicles"). Under
 * ingress the app is served from /api/hassio_ingress/<token>/, and the server
 * injects a matching <base href>; a leading slash would escape that prefix and
 * hit Home Assistant's own API instead of ours.
 */
import type {
  Component,
  ComponentState,
  ModStatus,
  Modification,
  Priority,
  ServiceEntry,
  Vehicle,
  VehicleTotals,
  WishlistItem,
  WishlistSummary,
} from '@grg/shared';

export interface VehicleSummary extends Vehicle {
  overdueCount: number;
  dueSoonCount: number;
  openWishlist: number;
}

export interface VehicleDetail {
  vehicle: Vehicle;
  components: ComponentState[];
  entries: ServiceEntry[];
  wishlist: WishlistItem[];
  modifications: Modification[];
  totals: VehicleTotals;
  wishlistSummary: WishlistSummary;
  renewals: {
    registration: { permanent: boolean; days: number | null };
    insurance: { days: number | null };
  };
}

export interface Meta {
  componentCategories: string[];
  priorities: Priority[];
  modStatuses: ModStatus[];
  homeAssistant: { available: boolean; sensorPrefix: string | null };
}

/** Carries the server's message so the UI can show why, not just that. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(method: string, path: string, payload?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`api/${path}`, {
      method,
      headers: payload === undefined ? undefined : { 'content-type': 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
  } catch (cause) {
    // A dead add-on and a dropped phone connection look the same from here;
    // say so plainly rather than surfacing "Failed to fetch".
    throw new ApiError(0, 'offline', 'Cannot reach the garage. Is the add-on running?');
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const parsed: unknown = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = (parsed as { error?: { code?: string; message?: string } })?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'error',
      error?.message ?? `Request failed (${response.status})`,
    );
  }
  return parsed as T;
}

const get = <T,>(path: string) => request<T>('GET', path);
const post = <T,>(path: string, payload?: unknown) => request<T>('POST', path, payload);
const patch = <T,>(path: string, payload: unknown) => request<T>('PATCH', path, payload);
const put = <T,>(path: string, payload: unknown) => request<T>('PUT', path, payload);
const del = (path: string) => request<void>('DELETE', path);

export type VehicleInput = Partial<Omit<Vehicle, 'id'>> & { seedComponents?: boolean };
export type ComponentInput = Partial<Omit<Component, 'id' | 'vehicleId'>>;
export type EntryInput = Partial<Omit<ServiceEntry, 'id' | 'vehicleId' | 'componentId'>>;
export type WishlistInput = Partial<Omit<WishlistItem, 'id' | 'vehicleId' | 'added' | 'completed'>>;
export type ModInput = Partial<Omit<Modification, 'id' | 'vehicleId'>>;

export interface ServiceInput {
  date?: string;
  odometer?: number;
  cost?: number;
  parts?: string;
  note?: string;
  task?: string;
}

export const api = {
  meta: () => get<Meta>('meta'),
  settings: () => get<Record<string, string>>('settings'),
  saveSettings: (patchBody: Record<string, string>) =>
    put<Record<string, string>>('settings', patchBody),

  vehicles: () => get<VehicleSummary[]>('vehicles'),
  vehicle: (id: number) => get<VehicleDetail>(`vehicles/${id}`),
  createVehicle: (input: VehicleInput) => post<Vehicle>('vehicles', input),
  updateVehicle: (id: number, input: VehicleInput) => patch<Vehicle>(`vehicles/${id}`, input),
  deleteVehicle: (id: number) => del(`vehicles/${id}`),
  setOdometer: (id: number, odometer: number) =>
    put<Vehicle>(`vehicles/${id}/odometer`, { odometer }),

  createComponent: (vehicleId: number, input: ComponentInput) =>
    post<ComponentState>(`vehicles/${vehicleId}/components`, input),
  updateComponent: (componentId: number, input: ComponentInput) =>
    patch<ComponentState>(`components/${componentId}`, input),
  deleteComponent: (componentId: number) => del(`components/${componentId}`),
  serviceComponent: (componentId: number, input: ServiceInput) =>
    post<{ component: ComponentState; entry: ServiceEntry }>(
      `components/${componentId}/service`,
      input,
    ),

  createEntry: (vehicleId: number, input: EntryInput) =>
    post<ServiceEntry>(`vehicles/${vehicleId}/entries`, input),
  updateEntry: (entryId: number, input: EntryInput) =>
    patch<ServiceEntry>(`entries/${entryId}`, input),
  deleteEntry: (entryId: number) => del(`entries/${entryId}`),

  createWishlist: (vehicleId: number, input: WishlistInput) =>
    post<WishlistItem>(`vehicles/${vehicleId}/wishlist`, input),
  updateWishlist: (itemId: number, input: WishlistInput) =>
    patch<WishlistItem>(`wishlist/${itemId}`, input),
  deleteWishlist: (itemId: number) => del(`wishlist/${itemId}`),

  createMod: (vehicleId: number, input: ModInput) =>
    post<Modification>(`vehicles/${vehicleId}/modifications`, input),
  updateMod: (modId: number, input: ModInput) =>
    patch<Modification>(`modifications/${modId}`, input),
  deleteMod: (modId: number) => del(`modifications/${modId}`),

  publish: () => post<{ published: number; available: boolean }>('homeassistant/publish'),
};

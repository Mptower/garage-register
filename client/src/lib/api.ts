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
  ReminderDigest,
  ReminderItem,
  ReminderSettings,
  ServiceEntry,
  Vehicle,
  VehicleTotals,
  WishlistItem,
  WishlistSummary,
} from '@grg/shared';

export interface ReminderReport {
  settings: ReminderSettings;
  items: ReminderItem[];
  digest: ReminderDigest | null;
  wouldSend: boolean;
  reason: string;
  /** Why a send is impossible, regardless of the settings. */
  blocked: 'no_home_assistant' | 'no_notify_service' | null;
  notifyConfigured: boolean;
  homeAssistant: boolean;
}

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

export interface StoredPhoto {
  /** Relative, e.g. "photos/v1-a1b2c3d4e5f6.jpg", so ingress keeps working. */
  url: string;
  filename: string;
  type: string;
  bytes: number;
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

async function handle<T>(response: Response): Promise<T> {
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

const OFFLINE = 'Cannot reach the garage. Is the add-on running?';

async function request<T>(method: string, path: string, payload?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`api/${path}`, {
      method,
      headers: payload === undefined ? undefined : { 'content-type': 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
  } catch {
    // A dead add-on and a dropped phone connection look the same from here;
    // say so plainly rather than surfacing "Failed to fetch".
    throw new ApiError(0, 'offline', OFFLINE);
  }
  return handle<T>(response);
}

/**
 * Sends an image as the raw request body.
 *
 * Not multipart: one file needs none of what multipart buys, and keeping it
 * out means the server needs no parser for it. The Content-Type must be a real
 * image type — the server reads the bytes to confirm, but a JSON label would
 * be claimed by the JSON body parser first and fail as malformed JSON.
 */
async function upload<T>(path: string, blob: Blob): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`api/${path}`, {
      method: 'PUT',
      headers: { 'content-type': blob.type || 'image/jpeg' },
      body: blob,
    });
  } catch {
    throw new ApiError(0, 'offline', OFFLINE);
  }
  return handle<T>(response);
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
    put<{ settings: Record<string, string>; reminders: ReminderSettings }>('settings', patchBody),

  reminders: () => get<ReminderReport>('reminders'),
  testReminder: () =>
    post<{ sent: boolean; blocked: string | null; items: number; digest: ReminderDigest | null }>(
      'reminders/test',
    ),

  vehicles: () => get<VehicleSummary[]>('vehicles'),  vehicle: (id: number) => get<VehicleDetail>(`vehicles/${id}`),
  createVehicle: (input: VehicleInput) => post<Vehicle>('vehicles', input),
  updateVehicle: (id: number, input: VehicleInput) => patch<Vehicle>(`vehicles/${id}`, input),
  deleteVehicle: (id: number) => del(`vehicles/${id}`),
  setOdometer: (id: number, odometer: number) =>
    put<Vehicle>(`vehicles/${id}/odometer`, { odometer }),

  uploadPhoto: (id: number, blob: Blob) =>
    upload<{ vehicle: Vehicle; photo: StoredPhoto }>(`vehicles/${id}/photo`, blob),
  clearPhoto: (id: number) => del(`vehicles/${id}/photo`),

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

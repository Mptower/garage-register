/**
 * Settings the owner controls, stored in the database.
 *
 * Deliberately not add-on options. The add-on's configuration holds only the
 * handful of identifiers that depend on how a particular Home Assistant is
 * named; anything a *vehicle owner* would change belongs on the app's own
 * Settings screen. Splitting them would recreate the failure the garden app
 * already hit: two settings pages that disagree, with one silently winning.
 *
 * Everything is stored as text, because the settings table is a key/value
 * store and a schema per setting is not worth the migration. The parsing here
 * is the single place that turns that text back into meaning, so the client
 * and the server cannot disagree about what "8" or "" means.
 */

export interface ReminderSettings {
  enabled: boolean;
  /** Local hour, 0–23, at which the daily check runs. */
  hour: number;
  /** How far ahead a dated renewal starts being mentioned. */
  leadDays: number;
  /** Whether components merely approaching their interval are included. */
  includeDueSoon: boolean;
  /** How long before something still outstanding is raised again. */
  repeatDays: number;
}

export const SETTING_KEYS = {
  remindersEnabled: 'reminders.enabled',
  remindersHour: 'reminders.hour',
  remindersLeadDays: 'reminders.leadDays',
  remindersIncludeDueSoon: 'reminders.includeDueSoon',
  remindersRepeatDays: 'reminders.repeatDays',
  /** Bookkeeping, written by the scheduler rather than the owner. */
  remindersLastSentAt: 'reminders.lastSentAt',
  remindersLastKeys: 'reminders.lastKeys',
  remindersLastCheckOn: 'reminders.lastCheckOn',
  garageName: 'garage.name',
} as const;

export const REMINDER_DEFAULTS: ReminderSettings = {
  // Off until asked for: an add-on that starts messaging someone's phone the
  // moment it is installed has made a decision that was not its to make.
  enabled: false,
  hour: 8,
  leadDays: 30,
  includeDueSoon: true,
  repeatDays: 7,
};

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function readBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(raw.trim().toLowerCase());
}

/** Tolerant by design: a malformed value falls back rather than throwing. */
export function readReminderSettings(raw: Record<string, string>): ReminderSettings {
  return {
    enabled: readBool(raw[SETTING_KEYS.remindersEnabled], REMINDER_DEFAULTS.enabled),
    hour: clampInt(raw[SETTING_KEYS.remindersHour], REMINDER_DEFAULTS.hour, 0, 23),
    leadDays: clampInt(raw[SETTING_KEYS.remindersLeadDays], REMINDER_DEFAULTS.leadDays, 0, 365),
    includeDueSoon: readBool(
      raw[SETTING_KEYS.remindersIncludeDueSoon],
      REMINDER_DEFAULTS.includeDueSoon,
    ),
    repeatDays: clampInt(raw[SETTING_KEYS.remindersRepeatDays], REMINDER_DEFAULTS.repeatDays, 1, 90),
  };
}

export function reminderSettingsToRecord(settings: ReminderSettings): Record<string, string> {
  return {
    [SETTING_KEYS.remindersEnabled]: String(settings.enabled),
    [SETTING_KEYS.remindersHour]: String(settings.hour),
    [SETTING_KEYS.remindersLeadDays]: String(settings.leadDays),
    [SETTING_KEYS.remindersIncludeDueSoon]: String(settings.includeDueSoon),
    [SETTING_KEYS.remindersRepeatDays]: String(settings.repeatDays),
  };
}

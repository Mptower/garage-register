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
export declare const SETTING_KEYS: {
    readonly remindersEnabled: "reminders.enabled";
    readonly remindersHour: "reminders.hour";
    readonly remindersLeadDays: "reminders.leadDays";
    readonly remindersIncludeDueSoon: "reminders.includeDueSoon";
    readonly remindersRepeatDays: "reminders.repeatDays";
    /** Bookkeeping, written by the scheduler rather than the owner. */
    readonly remindersLastSentAt: "reminders.lastSentAt";
    readonly remindersLastKeys: "reminders.lastKeys";
    readonly remindersLastCheckOn: "reminders.lastCheckOn";
    readonly garageName: "garage.name";
};
export declare const REMINDER_DEFAULTS: ReminderSettings;
/** Tolerant by design: a malformed value falls back rather than throwing. */
export declare function readReminderSettings(raw: Record<string, string>): ReminderSettings;
export declare function reminderSettingsToRecord(settings: ReminderSettings): Record<string, string>;
//# sourceMappingURL=settings.d.ts.map
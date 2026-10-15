import type { ComponentState } from './types.ts';
import type { ReminderSettings } from './settings.ts';
export type ReminderKind = 'component' | 'registration' | 'insurance';
export type ReminderSeverity = 'overdue' | 'soon';
export interface ReminderItem {
    /** Stable identity, including severity so an escalation counts as news. */
    key: string;
    vehicleId: number;
    vehicleName: string;
    kind: ReminderKind;
    severity: ReminderSeverity;
    subject: string;
    detail: string;
}
export interface ReminderVehicle {
    id: number;
    name: string;
    components: readonly ComponentState[];
    registrationPermanent: boolean;
    registrationExpires: string | null;
    insuranceRenews: string | null;
}
export declare function collectReminders(vehicles: readonly ReminderVehicle[], settings: ReminderSettings, now?: Date): ReminderItem[];
export interface SendDecision {
    send: boolean;
    reason: 'disabled' | 'nothing_due' | 'new_items' | 'repeat_due' | 'already_reported' | 'never_sent';
    newKeys: string[];
}
/**
 * Whether this set of reminders is worth sending now.
 *
 * Two things earn a notification: something that was not outstanding before,
 * and something that has stayed outstanding long enough to deserve a second
 * mention. Everything else is noise, and a reminder that arrives every morning
 * regardless is one the owner will silence — after which it protects nothing.
 */
export declare function decideSend(items: readonly ReminderItem[], settings: ReminderSettings, previousKeys: readonly string[], lastSentAt: Date | null, now: Date): SendDecision;
export interface ReminderDigest {
    title: string;
    message: string;
}
export declare function formatDigest(items: readonly ReminderItem[], garageName?: string): ReminderDigest;
//# sourceMappingURL=reminders.d.ts.map
/**
 * Deciding what is worth telling the owner about, and whether to say it again.
 *
 * Kept pure so the hard part — *not* sending the same thing every morning
 * until they give up and mute the notification — can be tested without a
 * clock, a database or Home Assistant.
 */
import { daysUntil } from "./domain.js";
function describeComponent(state) {
    if (state.overdue) {
        // Computed from milesSince rather than milesLeft: the latter is clamped at
        // zero so the gauges can render "0 mi left" rather than a negative, which
        // means the overage is not recoverable from it.
        const by = [];
        if (state.intervalMiles > 0 && state.milesSince !== null) {
            const over = state.milesSince - state.intervalMiles;
            if (over > 0)
                by.push(`${over.toLocaleString()} mi over`);
        }
        if (state.intervalMonths > 0 && state.monthsSince !== null) {
            const over = Math.round(state.monthsSince - state.intervalMonths);
            if (over > 0)
                by.push(`${over} ${over === 1 ? 'month' : 'months'} over`);
        }
        return by.length > 0 ? by.join(', ') : 'past its interval';
    }
    const left = [];
    if (state.milesLeft !== null) {
        left.push(`${state.milesLeft.toLocaleString()} mi left`);
    }
    if (state.monthsLeft !== null) {
        const months = Math.round(state.monthsLeft);
        left.push(`${months} ${months === 1 ? 'month' : 'months'} left`);
    }
    return left.length > 0 ? left.join(', ') : 'approaching its interval';
}
function describeDays(days) {
    if (days < 0)
        return `expired ${Math.abs(days)} days ago`;
    if (days === 0)
        return 'expires today';
    if (days === 1)
        return 'expires tomorrow';
    return `expires in ${days} days`;
}
export function collectReminders(vehicles, settings, now) {
    const items = [];
    for (const vehicle of vehicles) {
        for (const component of vehicle.components) {
            // An untracked or never-serviced component has nothing to be late for;
            // componentState already reports those as not overdue and not due soon.
            const severity = component.overdue
                ? 'overdue'
                : component.dueSoon && settings.includeDueSoon
                    ? 'soon'
                    : null;
            if (!severity)
                continue;
            items.push({
                key: `v${vehicle.id}:c${component.componentId}:${severity}`,
                vehicleId: vehicle.id,
                vehicleName: vehicle.name,
                kind: 'component',
                severity,
                subject: component.name,
                detail: describeComponent(component),
            });
        }
        // A permanent registration has no date to count down to. Treating a blank
        // expiry as "expired" would report the Wisconsin Collector plate as
        // overdue every single day, for ever.
        if (!vehicle.registrationPermanent) {
            const days = daysUntil(vehicle.registrationExpires, now);
            if (days !== null && days <= settings.leadDays) {
                items.push({
                    key: `v${vehicle.id}:registration:${days < 0 ? 'overdue' : 'soon'}`,
                    vehicleId: vehicle.id,
                    vehicleName: vehicle.name,
                    kind: 'registration',
                    severity: days < 0 ? 'overdue' : 'soon',
                    subject: 'Registration',
                    detail: describeDays(days),
                });
            }
        }
        const insuranceDays = daysUntil(vehicle.insuranceRenews, now);
        if (insuranceDays !== null && insuranceDays <= settings.leadDays) {
            items.push({
                key: `v${vehicle.id}:insurance:${insuranceDays < 0 ? 'overdue' : 'soon'}`,
                vehicleId: vehicle.id,
                vehicleName: vehicle.name,
                kind: 'insurance',
                severity: insuranceDays < 0 ? 'overdue' : 'soon',
                subject: 'Insurance',
                detail: describeDays(insuranceDays),
            });
        }
    }
    // Overdue first; the ordering is what the message leads with.
    return items.sort((a, b) => {
        if (a.severity !== b.severity)
            return a.severity === 'overdue' ? -1 : 1;
        return a.vehicleName.localeCompare(b.vehicleName) || a.subject.localeCompare(b.subject);
    });
}
/**
 * Whether this set of reminders is worth sending now.
 *
 * Two things earn a notification: something that was not outstanding before,
 * and something that has stayed outstanding long enough to deserve a second
 * mention. Everything else is noise, and a reminder that arrives every morning
 * regardless is one the owner will silence — after which it protects nothing.
 */
export function decideSend(items, settings, previousKeys, lastSentAt, now) {
    if (!settings.enabled)
        return { send: false, reason: 'disabled', newKeys: [] };
    if (items.length === 0)
        return { send: false, reason: 'nothing_due', newKeys: [] };
    const previous = new Set(previousKeys);
    const newKeys = items.map((i) => i.key).filter((key) => !previous.has(key));
    if (newKeys.length > 0)
        return { send: true, reason: 'new_items', newKeys };
    if (lastSentAt === null)
        return { send: true, reason: 'never_sent', newKeys };
    const elapsedDays = (now.getTime() - lastSentAt.getTime()) / 86_400_000;
    if (elapsedDays >= settings.repeatDays) {
        return { send: true, reason: 'repeat_due', newKeys };
    }
    return { send: false, reason: 'already_reported', newKeys };
}
export function formatDigest(items, garageName = 'The Garage') {
    const overdue = items.filter((i) => i.severity === 'overdue');
    const soon = items.filter((i) => i.severity === 'soon');
    const headline = overdue.length > 0
        ? `${overdue.length} overdue${soon.length > 0 ? `, ${soon.length} due soon` : ''}`
        : `${soon.length} due soon`;
    const byVehicle = new Map();
    for (const item of items) {
        const list = byVehicle.get(item.vehicleName) ?? [];
        list.push(item);
        byVehicle.set(item.vehicleName, list);
    }
    const lines = [];
    for (const [vehicle, list] of byVehicle) {
        lines.push(vehicle);
        for (const item of list) {
            const mark = item.severity === 'overdue' ? '!' : '-';
            lines.push(`  ${mark} ${item.subject} — ${item.detail}`);
        }
    }
    return { title: `${garageName}: ${headline}`, message: lines.join('\n') };
}
//# sourceMappingURL=reminders.js.map
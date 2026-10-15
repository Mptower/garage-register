/**
 * Domain types.
 *
 * A *component* is anything on the vehicle with a service or replacement life:
 * engine oil, a battery, a set of tyres, a fan belt. Modelling them uniformly
 * is what lets a car carry both a 6 V and a 12 V battery, each tracked on its
 * own interval, without either being a special case.
 */
export const COMPONENT_CATEGORIES = [
    'fluid', 'battery', 'tire', 'filter', 'belt', 'ignition', 'brake', 'other',
];
export const CATEGORY_ICON = {
    fluid: 'Droplet',
    battery: 'BatteryCharging',
    tire: 'CircleDot',
    filter: 'Filter',
    belt: 'RefreshCw',
    ignition: 'Zap',
    brake: 'Disc',
    other: 'Wrench',
};
export const PRIORITIES = ['crucial', 'mechanical', 'cosmetic'];
export const MOD_STATUSES = [
    'planned', 'in_progress', 'installed', 'removed',
];
export const SERVICE_CATEGORIES = [
    'Lubrication', 'Ignition', 'Fuel System', 'Cooling', 'Brakes', 'Electrical',
    'Chassis', 'Suspension', 'Steering', 'Exhaust', 'Transmission', 'Tires',
    'Body', 'Interior', 'Inspection', 'Other',
];
//# sourceMappingURL=types.js.map
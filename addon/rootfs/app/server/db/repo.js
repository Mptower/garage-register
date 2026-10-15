import { toISO, today } from '@grg/shared';
const bool = (value) => value === 1 || value === true;
const num = (value, fallback = 0) => typeof value === 'number' ? value : fallback;
const str = (value, fallback = '') => typeof value === 'string' ? value : fallback;
const nullable = (value) => typeof value === 'string' && value !== '' ? value : null;
// ------------------------------------------------------------------- mapping
function toVehicle(row) {
    return {
        id: num(row.id),
        year: num(row.year),
        make: str(row.make),
        model: str(row.model),
        body: str(row.body),
        vin: str(row.vin),
        plate: str(row.plate),
        plateLegendTop: str(row.plate_legend_top, 'COLLECTOR'),
        plateLegendBottom: str(row.plate_legend_bottom, 'WISCONSIN'),
        photo: str(row.photo),
        odometer: num(row.odometer),
        registrationPermanent: bool(row.registration_permanent),
        registrationExpires: nullable(row.registration_expires),
        insuranceCarrier: str(row.insurance_carrier),
        insuranceRenews: nullable(row.insurance_renews),
        agreedValue: str(row.agreed_value),
        archived: bool(row.archived),
    };
}
function toComponent(row) {
    return {
        id: num(row.id),
        vehicleId: num(row.vehicle_id),
        name: str(row.name),
        category: str(row.category, 'other'),
        icon: str(row.icon),
        spec: str(row.spec),
        qty: num(row.qty, 1),
        intervalMiles: num(row.interval_miles),
        intervalMonths: num(row.interval_months),
        lastDate: nullable(row.last_date),
        lastOdometer: row.last_odometer === null ? null : num(row.last_odometer),
        notes: str(row.notes),
    };
}
function toEntry(row) {
    return {
        id: num(row.id),
        vehicleId: num(row.vehicle_id),
        date: str(row.date),
        odometer: num(row.odometer),
        category: str(row.category, 'Other'),
        task: str(row.task),
        parts: str(row.parts),
        cost: num(row.cost),
        note: str(row.note),
        componentId: row.component_id === null ? null : num(row.component_id),
    };
}
function toWishlist(row) {
    return {
        id: num(row.id),
        vehicleId: num(row.vehicle_id),
        title: str(row.title),
        detail: str(row.detail),
        priority: str(row.priority, 'mechanical'),
        estimate: num(row.estimate),
        done: bool(row.done),
        added: str(row.added),
        completed: nullable(row.completed),
    };
}
function toMod(row) {
    return {
        id: num(row.id),
        vehicleId: num(row.vehicle_id),
        title: str(row.title),
        detail: str(row.detail),
        status: str(row.status, 'planned'),
        cost: num(row.cost),
        date: str(row.date),
        reversible: bool(row.reversible),
    };
}
// ------------------------------------------------------------------ vehicles
export function listVehicles(db, includeArchived = false) {
    const sql = includeArchived
        ? 'SELECT * FROM vehicles ORDER BY sort_order, id'
        : 'SELECT * FROM vehicles WHERE archived = 0 ORDER BY sort_order, id';
    return db.prepare(sql).all().map(toVehicle);
}
export function getVehicle(db, id) {
    const row = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id);
    return row ? toVehicle(row) : null;
}
export function createVehicle(db, input) {
    const next = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM vehicles').get();
    const info = db
        .prepare(`INSERT INTO vehicles
         (year, make, model, body, vin, plate, plate_legend_top, plate_legend_bottom,
          photo, odometer, registration_permanent, registration_expires,
          insurance_carrier, insurance_renews, agreed_value, sort_order)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(input.year, input.make, input.model, input.body ?? '', input.vin ?? '', input.plate ?? '', input.plateLegendTop ?? 'COLLECTOR', input.plateLegendBottom ?? 'WISCONSIN', input.photo ?? '', input.odometer ?? 0, input.registrationPermanent ? 1 : 0, input.registrationExpires ?? null, input.insuranceCarrier ?? '', input.insuranceRenews ?? null, input.agreedValue ?? '', next.n);
    return getVehicle(db, Number(info.lastInsertRowid));
}
const VEHICLE_COLUMNS = {
    year: 'year',
    make: 'make',
    model: 'model',
    body: 'body',
    vin: 'vin',
    plate: 'plate',
    plateLegendTop: 'plate_legend_top',
    plateLegendBottom: 'plate_legend_bottom',
    photo: 'photo',
    odometer: 'odometer',
    registrationPermanent: 'registration_permanent',
    registrationExpires: 'registration_expires',
    insuranceCarrier: 'insurance_carrier',
    insuranceRenews: 'insurance_renews',
    agreedValue: 'agreed_value',
    archived: 'archived',
};
export function updateVehicle(db, id, patch) {
    const sets = [];
    const values = [];
    for (const [key, column] of Object.entries(VEHICLE_COLUMNS)) {
        const value = patch[key];
        if (value === undefined)
            continue;
        sets.push(`${column} = ?`);
        values.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
    }
    if (sets.length === 0)
        return getVehicle(db, id);
    values.push(id);
    db.prepare(`UPDATE vehicles SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return getVehicle(db, id);
}
export function deleteVehicle(db, id) {
    return db.prepare('DELETE FROM vehicles WHERE id = ?').run(id).changes > 0;
}
/**
 * Clears a vehicle's history while keeping the vehicle.
 *
 * For when the car itself stays but its record should not: a mis-keyed import,
 * a replaced odometer, or a car bought with someone else's paperwork.
 *
 * Clearing the log also clears every component's last-serviced mark. Those
 * dates came *from* the log, so leaving them would have the gauges counting
 * down from a service that no longer exists anywhere in the record.
 */
export function resetVehicle(db, id, options) {
    if (!getVehicle(db, id))
        return null;
    db.exec('BEGIN');
    try {
        if (options.log) {
            db.prepare('DELETE FROM service_entries WHERE vehicle_id = ?').run(id);
            db.prepare('UPDATE components SET last_date = NULL, last_odometer = NULL WHERE vehicle_id = ?').run(id);
        }
        if (options.wishlist) {
            db.prepare('DELETE FROM wishlist WHERE vehicle_id = ?').run(id);
        }
        if (options.modifications) {
            db.prepare('DELETE FROM modifications WHERE vehicle_id = ?').run(id);
        }
        if (options.components === 'clear' || options.components === 'reseed') {
            db.prepare('DELETE FROM components WHERE vehicle_id = ?').run(id);
        }
        if (options.odometer !== undefined) {
            db.prepare('UPDATE vehicles SET odometer = ? WHERE id = ?').run(options.odometer, id);
        }
        db.exec('COMMIT');
    }
    catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
    // Seeded outside the transaction so it reuses createComponent's own ordering.
    if (options.components === 'reseed') {
        seedComponents(db, id);
    }
    return getVehicle(db, id);
}
/**
 * Empties the garage.
 *
 * Settings survive: units and reminder preferences are about the owner, not
 * the cars, and losing them on a reset would be a surprise rather than a help.
 */
export function resetGarage(db) {
    const before = db.prepare('SELECT COUNT(*) AS n FROM vehicles').get().n;
    // ON DELETE CASCADE takes the components, log, wishlist and mods with them.
    db.prepare('DELETE FROM vehicles').run();
    return { vehicles: before };
}
/**
 * Raises the odometer, never lowers it.
 *
 * Back-dating a forgotten job is normal and its reading is historical; letting
 * it overwrite the current one would rewind the car and make every interval
 * look fresher than it is.
 */
export function raiseOdometer(db, vehicleId, reading) {
    db.prepare('UPDATE vehicles SET odometer = MAX(odometer, ?) WHERE id = ?').run(reading, vehicleId);
}
export function setOdometer(db, vehicleId, reading) {
    db.prepare('UPDATE vehicles SET odometer = ? WHERE id = ?').run(reading, vehicleId);
}
// ---------------------------------------------------------------- components
export function listComponents(db, vehicleId) {
    return db
        .prepare('SELECT * FROM components WHERE vehicle_id = ? ORDER BY sort_order, id')
        .all(vehicleId).map(toComponent);
}
export function getComponent(db, id) {
    const row = db.prepare('SELECT * FROM components WHERE id = ?').get(id);
    return row ? toComponent(row) : null;
}
export function createComponent(db, vehicleId, input) {
    const next = db
        .prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM components WHERE vehicle_id = ?')
        .get(vehicleId);
    const info = db
        .prepare(`INSERT INTO components
         (vehicle_id, name, category, icon, spec, qty, interval_miles, interval_months,
          last_date, last_odometer, notes, sort_order)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(vehicleId, input.name, input.category ?? 'other', input.icon ?? '', input.spec ?? '', input.qty ?? 1, input.intervalMiles ?? 0, input.intervalMonths ?? 0, input.lastDate ?? null, input.lastOdometer ?? null, input.notes ?? '', next.n);
    return getComponent(db, Number(info.lastInsertRowid));
}
const COMPONENT_COLUMNS = {
    name: 'name',
    category: 'category',
    icon: 'icon',
    spec: 'spec',
    qty: 'qty',
    intervalMiles: 'interval_miles',
    intervalMonths: 'interval_months',
    lastDate: 'last_date',
    lastOdometer: 'last_odometer',
    notes: 'notes',
};
export function updateComponent(db, id, patch) {
    const sets = [];
    const values = [];
    for (const [key, column] of Object.entries(COMPONENT_COLUMNS)) {
        const value = patch[key];
        if (value === undefined)
            continue;
        sets.push(`${column} = ?`);
        values.push(value);
    }
    if (sets.length === 0)
        return getComponent(db, id);
    values.push(id);
    db.prepare(`UPDATE components SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return getComponent(db, id);
}
export function deleteComponent(db, id) {
    return db.prepare('DELETE FROM components WHERE id = ?').run(id).changes > 0;
}
/**
 * Records that a component was serviced, and writes the matching ledger entry.
 *
 * One call rather than two so the history can never disagree with the interval:
 * there is no path that resets the clock without also recording why.
 */
export function serviceComponent(db, component, input) {
    const vehicle = getVehicle(db, component.vehicleId);
    const date = input.date ?? toISO(today());
    const odometer = input.odometer ?? vehicle?.odometer ?? 0;
    // "changed" reads right for a fluid and wrong for a battery.
    const verb = component.category === 'fluid' ? 'changed' : 'replaced';
    const task = input.task?.trim() || `${component.name} ${verb}`;
    const category = input.category ?? (component.category === 'fluid' ? 'Lubrication' : 'Other');
    db.exec('BEGIN');
    try {
        db.prepare('UPDATE components SET last_date = ?, last_odometer = ? WHERE id = ?').run(date, odometer, component.id);
        const info = db
            .prepare(`INSERT INTO service_entries
           (vehicle_id, date, odometer, category, task, parts, cost, note, component_id)
         VALUES (?,?,?,?,?,?,?,?,?)`)
            .run(component.vehicleId, date, odometer, category, task, input.parts ?? component.spec, input.cost ?? 0, input.note ?? '', component.id);
        db.prepare('UPDATE vehicles SET odometer = MAX(odometer, ?) WHERE id = ?').run(odometer, component.vehicleId);
        db.exec('COMMIT');
        return {
            component: getComponent(db, component.id),
            entry: getEntry(db, Number(info.lastInsertRowid)),
        };
    }
    catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
}
// ----------------------------------------------------------------- service log
export function listEntries(db, vehicleId, limit) {
    const sql = 'SELECT * FROM service_entries WHERE vehicle_id = ? ORDER BY date DESC, odometer DESC, id DESC' +
        (limit ? ' LIMIT ?' : '');
    const rows = (limit
        ? db.prepare(sql).all(vehicleId, limit)
        : db.prepare(sql).all(vehicleId));
    return rows.map(toEntry);
}
export function getEntry(db, id) {
    const row = db.prepare('SELECT * FROM service_entries WHERE id = ?').get(id);
    return row ? toEntry(row) : null;
}
export function createEntry(db, vehicleId, input) {
    const vehicle = getVehicle(db, vehicleId);
    const odometer = input.odometer ?? vehicle?.odometer ?? 0;
    const info = db
        .prepare(`INSERT INTO service_entries
         (vehicle_id, date, odometer, category, task, parts, cost, note)
       VALUES (?,?,?,?,?,?,?,?)`)
        .run(vehicleId, input.date ?? toISO(today()), odometer, input.category ?? 'Other', input.task, input.parts ?? '', input.cost ?? 0, input.note ?? '');
    raiseOdometer(db, vehicleId, odometer);
    return getEntry(db, Number(info.lastInsertRowid));
}
export function updateEntry(db, id, patch) {
    const columns = {
        date: 'date',
        odometer: 'odometer',
        category: 'category',
        task: 'task',
        parts: 'parts',
        cost: 'cost',
        note: 'note',
    };
    const sets = [];
    const values = [];
    for (const [key, column] of Object.entries(columns)) {
        const value = patch[key];
        if (value === undefined)
            continue;
        sets.push(`${column} = ?`);
        values.push(value);
    }
    if (sets.length === 0)
        return getEntry(db, id);
    values.push(id);
    db.prepare(`UPDATE service_entries SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return getEntry(db, id);
}
export function deleteEntry(db, id) {
    return db.prepare('DELETE FROM service_entries WHERE id = ?').run(id).changes > 0;
}
// -------------------------------------------------------------------- wishlist
export function listWishlist(db, vehicleId) {
    return db
        .prepare(`SELECT * FROM wishlist WHERE vehicle_id = ?
         ORDER BY done,
                  CASE priority WHEN 'crucial' THEN 0 WHEN 'mechanical' THEN 1 ELSE 2 END,
                  id`)
        .all(vehicleId).map(toWishlist);
}
export function createWishlist(db, vehicleId, input) {
    const info = db
        .prepare('INSERT INTO wishlist (vehicle_id, title, detail, priority, estimate) VALUES (?,?,?,?,?)')
        .run(vehicleId, input.title, input.detail ?? '', input.priority ?? 'mechanical', input.estimate ?? 0);
    return getWishlist(db, Number(info.lastInsertRowid));
}
export function getWishlist(db, id) {
    const row = db.prepare('SELECT * FROM wishlist WHERE id = ?').get(id);
    return row ? toWishlist(row) : null;
}
export function updateWishlist(db, id, patch) {
    const sets = [];
    const values = [];
    const columns = {
        title: 'title',
        detail: 'detail',
        priority: 'priority',
        estimate: 'estimate',
    };
    for (const [key, column] of Object.entries(columns)) {
        const value = patch[key];
        if (value === undefined)
            continue;
        sets.push(`${column} = ?`);
        values.push(value);
    }
    // Completing and re-opening both have to move `completed`, or a re-opened
    // item would keep a date that says it is finished.
    if (patch.done !== undefined) {
        sets.push('done = ?', 'completed = ?');
        values.push(patch.done ? 1 : 0, patch.done ? toISO(today()) : null);
    }
    if (sets.length === 0)
        return getWishlist(db, id);
    values.push(id);
    db.prepare(`UPDATE wishlist SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return getWishlist(db, id);
}
export function deleteWishlist(db, id) {
    return db.prepare('DELETE FROM wishlist WHERE id = ?').run(id).changes > 0;
}
// --------------------------------------------------------------- modifications
export function listMods(db, vehicleId) {
    return db
        .prepare(`SELECT * FROM modifications WHERE vehicle_id = ?
         ORDER BY CASE status
                    WHEN 'installed' THEN 0 WHEN 'in_progress' THEN 1
                    WHEN 'planned' THEN 2 ELSE 3 END,
                  date DESC, id`)
        .all(vehicleId).map(toMod);
}
export function createMod(db, vehicleId, input) {
    const info = db
        .prepare('INSERT INTO modifications (vehicle_id, title, detail, status, cost, date, reversible) VALUES (?,?,?,?,?,?,?)')
        .run(vehicleId, input.title, input.detail ?? '', input.status ?? 'planned', input.cost ?? 0, input.date ?? toISO(today()), input.reversible === false ? 0 : 1);
    return getMod(db, Number(info.lastInsertRowid));
}
export function getMod(db, id) {
    const row = db.prepare('SELECT * FROM modifications WHERE id = ?').get(id);
    return row ? toMod(row) : null;
}
export function updateMod(db, id, patch) {
    const sets = [];
    const values = [];
    const columns = {
        title: 'title',
        detail: 'detail',
        status: 'status',
        cost: 'cost',
        date: 'date',
    };
    for (const [key, column] of Object.entries(columns)) {
        const value = patch[key];
        if (value === undefined)
            continue;
        sets.push(`${column} = ?`);
        values.push(value);
    }
    if (patch.reversible !== undefined) {
        sets.push('reversible = ?');
        values.push(patch.reversible ? 1 : 0);
    }
    if (sets.length === 0)
        return getMod(db, id);
    values.push(id);
    db.prepare(`UPDATE modifications SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return getMod(db, id);
}
export function deleteMod(db, id) {
    return db.prepare('DELETE FROM modifications WHERE id = ?').run(id).changes > 0;
}
// -------------------------------------------------------------------- settings
export function getSetting(db, key) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row?.value ?? null;
}
export function setSetting(db, key, value) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}
export function allSettings(db) {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
/**
 * The components a classic usually needs, written once when a vehicle is added.
 *
 * Seeded rather than hard-coded so they can be renamed, re-intervalled or
 * deleted like anything else. Nothing re-adds them afterwards, so a component
 * the owner removed stays removed.
 */
export const DEFAULT_COMPONENTS = [
    { name: 'Engine Oil', category: 'fluid', intervalMiles: 1500, intervalMonths: 6, spec: 'SAE 10W-30 non-detergent' },
    { name: 'Transmission Fluid', category: 'fluid', intervalMiles: 10000, intervalMonths: 60, spec: 'SAE 80W-90 GL-1' },
    { name: 'Rear Differential', category: 'fluid', intervalMiles: 10000, intervalMonths: 60, spec: 'SAE 90 hypoid GL-4' },
    { name: 'Brake Fluid', category: 'fluid', intervalMiles: 24000, intervalMonths: 24, spec: 'DOT 3' },
    { name: 'Coolant', category: 'fluid', intervalMiles: 30000, intervalMonths: 24, spec: '50/50 ethylene glycol' },
    { name: 'Chassis Grease', category: 'fluid', intervalMiles: 1000, intervalMonths: 12, spec: 'NLGI-2' },
];
export function seedComponents(db, vehicleId) {
    for (const spec of DEFAULT_COMPONENTS) {
        createComponent(db, vehicleId, spec);
    }
}
//# sourceMappingURL=repo.js.map
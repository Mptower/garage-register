/**
 * The REST API the client drives.
 *
 * Everything the app can do is here, because everything the app can do is
 * meant to be editable from its own screens rather than from an admin page.
 */
import { Router } from 'express';
import express from 'express';
import { COMPONENT_CATEGORIES, MOD_STATUSES, PRIORITIES, componentState, daysUntil, vehicleTotals, wishlistSummary, } from '@grg/shared';
import * as repo from "../db/repo.js";
import { HttpError, asyncHandler, badRequest, notFound } from "../http.js";
import { ACCEPTED_TYPES, MAX_PHOTO_BYTES, removePhoto, savePhoto, } from "../photos.js";
// ------------------------------------------------------------------ parsing
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function id(req, name) {
    // Express 5 types a route param as string | string[]; a repeated param would
    // otherwise parse as NaN and fall through to a confusing lookup failure.
    const raw = req.params[name];
    const value = Number.parseInt(typeof raw === 'string' ? raw : '', 10);
    if (!Number.isInteger(value) || value <= 0) {
        throw badRequest(`${name} must be a positive integer`);
    }
    return value;
}
function body(req) {
    const value = req.body;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw badRequest('Expected a JSON object');
    }
    return value;
}
function optString(src, key, max = 2000) {
    const value = src[key];
    if (value === undefined)
        return undefined;
    if (typeof value !== 'string')
        throw badRequest(`${key} must be a string`);
    if (value.length > max)
        throw badRequest(`${key} is too long (max ${max})`);
    return value;
}
function reqString(src, key, max = 2000) {
    const value = optString(src, key, max);
    if (value === undefined || value.trim() === '')
        throw badRequest(`${key} is required`);
    return value;
}
function optNumber(src, key, { min = 0, max = 10_000_000, integer = false } = {}) {
    const raw = src[key];
    if (raw === undefined)
        return undefined;
    const value = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(value))
        throw badRequest(`${key} must be a number`);
    if (integer && !Number.isInteger(value))
        throw badRequest(`${key} must be a whole number`);
    if (value < min || value > max)
        throw badRequest(`${key} must be between ${min} and ${max}`);
    return value;
}
function optBool(src, key) {
    const value = src[key];
    if (value === undefined)
        return undefined;
    if (typeof value !== 'boolean')
        throw badRequest(`${key} must be true or false`);
    return value;
}
/** Accepts a date, or null to clear it; rejects anything that is not ISO. */
function optDate(src, key) {
    const value = src[key];
    if (value === undefined)
        return undefined;
    if (value === null || value === '')
        return null;
    if (typeof value !== 'string' || !ISO_DATE.test(value)) {
        throw badRequest(`${key} must be YYYY-MM-DD`);
    }
    return value;
}
function optEnum(src, key, allowed) {
    const value = src[key];
    if (value === undefined)
        return undefined;
    if (typeof value !== 'string' || !allowed.includes(value)) {
        throw badRequest(`${key} must be one of: ${allowed.join(', ')}`);
    }
    return value;
}
function vehicleOr404(db, vehicleId) {
    const vehicle = repo.getVehicle(db, vehicleId);
    if (!vehicle)
        throw notFound(`No vehicle ${vehicleId}`);
    return vehicle;
}
// -------------------------------------------------------------------- router
export function createApiRouter({ db, homeAssistant, dataDir }) {
    const router = Router();
    // ---------------------------------------------------------------- meta
    router.get('/health', (_req, res) => {
        res.json({ ok: true, vehicles: repo.listVehicles(db, true).length });
    });
    router.get('/meta', (_req, res) => {
        res.json({
            componentCategories: COMPONENT_CATEGORIES,
            priorities: PRIORITIES,
            modStatuses: MOD_STATUSES,
            homeAssistant: {
                available: homeAssistant?.available ?? false,
                sensorPrefix: homeAssistant?.sensorPrefix ?? null,
            },
        });
    });
    router.get('/settings', (_req, res) => res.json(repo.allSettings(db)));
    router.put('/settings', (req, res) => {
        const patch = body(req);
        for (const [key, value] of Object.entries(patch)) {
            if (typeof value !== 'string')
                throw badRequest(`${key} must be a string`);
            repo.setSetting(db, key, value);
        }
        res.json(repo.allSettings(db));
    });
    // ------------------------------------------------------------- vehicles
    router.get('/vehicles', (req, res) => {
        const includeArchived = req.query.archived === 'true';
        const vehicles = repo.listVehicles(db, includeArchived);
        // The list view needs enough to draw each plate and its warning lamp,
        // without the caller fetching every vehicle separately.
        res.json(vehicles.map((vehicle) => {
            const components = repo.listComponents(db, vehicle.id);
            const states = components.map((c) => componentState(c, vehicle.odometer));
            return {
                ...vehicle,
                overdueCount: states.filter((s) => s.overdue).length,
                dueSoonCount: states.filter((s) => s.dueSoon).length,
                openWishlist: repo.listWishlist(db, vehicle.id).filter((i) => !i.done).length,
            };
        }));
    });
    router.post('/vehicles', (req, res) => {
        const src = body(req);
        const vehicle = repo.createVehicle(db, {
            year: optNumber(src, 'year', { min: 1885, max: 2100, integer: true }) ?? 1949,
            make: reqString(src, 'make', 80),
            model: reqString(src, 'model', 80),
            body: optString(src, 'body', 80) ?? '',
            vin: optString(src, 'vin', 60) ?? '',
            plate: optString(src, 'plate', 20) ?? '',
            plateLegendTop: optString(src, 'plateLegendTop', 30) ?? 'COLLECTOR',
            plateLegendBottom: optString(src, 'plateLegendBottom', 30) ?? 'WISCONSIN',
            photo: optString(src, 'photo', 500) ?? '',
            odometer: optNumber(src, 'odometer', { integer: true }) ?? 0,
            registrationPermanent: optBool(src, 'registrationPermanent') ?? false,
            registrationExpires: optDate(src, 'registrationExpires') ?? null,
            insuranceCarrier: optString(src, 'insuranceCarrier', 120) ?? '',
            insuranceRenews: optDate(src, 'insuranceRenews') ?? null,
            agreedValue: optString(src, 'agreedValue', 40) ?? '',
        });
        // Seeded here and never again, so a component the owner deletes stays gone.
        if (optBool(src, 'seedComponents') !== false) {
            repo.seedComponents(db, vehicle.id);
        }
        res.status(201).json(vehicle);
    });
    /** Everything needed to draw one vehicle's whole app, in a single request. */
    router.get('/vehicles/:vehicleId', (req, res) => {
        const vehicle = vehicleOr404(db, id(req, 'vehicleId'));
        const entries = repo.listEntries(db, vehicle.id);
        const components = repo.listComponents(db, vehicle.id);
        const wishlist = repo.listWishlist(db, vehicle.id);
        res.json({
            vehicle,
            components: components.map((c) => componentState(c, vehicle.odometer)),
            entries,
            wishlist,
            modifications: repo.listMods(db, vehicle.id),
            totals: vehicleTotals(entries),
            wishlistSummary: wishlistSummary(wishlist),
            renewals: {
                // A permanent plate has nothing to count down to; reporting 0 days
                // would read as "expires today" forever.
                registration: vehicle.registrationPermanent
                    ? { permanent: true, days: null }
                    : { permanent: false, days: daysUntil(vehicle.registrationExpires) },
                insurance: { days: daysUntil(vehicle.insuranceRenews) },
            },
        });
    });
    router.patch('/vehicles/:vehicleId', (req, res) => {
        const vehicleId = id(req, 'vehicleId');
        const existing = vehicleOr404(db, vehicleId);
        const src = body(req);
        const updated = repo.updateVehicle(db, vehicleId, {
            year: optNumber(src, 'year', { min: 1885, max: 2100, integer: true }),
            make: optString(src, 'make', 80),
            model: optString(src, 'model', 80),
            body: optString(src, 'body', 80),
            vin: optString(src, 'vin', 60),
            plate: optString(src, 'plate', 20),
            plateLegendTop: optString(src, 'plateLegendTop', 30),
            plateLegendBottom: optString(src, 'plateLegendBottom', 30),
            photo: optString(src, 'photo', 500),
            odometer: optNumber(src, 'odometer', { integer: true }),
            registrationPermanent: optBool(src, 'registrationPermanent'),
            registrationExpires: optDate(src, 'registrationExpires'),
            insuranceCarrier: optString(src, 'insuranceCarrier', 120),
            insuranceRenews: optDate(src, 'insuranceRenews'),
            agreedValue: optString(src, 'agreedValue', 40),
            archived: optBool(src, 'archived'),
        });
        // Only once the row is safely updated, and only for a file we own: an
        // external URL in this field is somebody else's to manage.
        if (updated && updated.photo !== existing.photo) {
            removePhoto(dataDir, existing.photo);
        }
        res.json(updated);
    });
    router.delete('/vehicles/:vehicleId', (req, res) => {
        const vehicleId = id(req, 'vehicleId');
        // Read before deleting: afterwards there is no row to learn the filename
        // from, and the file would be orphaned in /data for ever.
        const existing = repo.getVehicle(db, vehicleId);
        if (!existing || !repo.deleteVehicle(db, vehicleId))
            throw notFound('No such vehicle');
        removePhoto(dataDir, existing.photo);
        res.status(204).end();
    });
    /**
     * Replaces a vehicle's photograph.
     *
     * The body is the image itself. Express is told to accept only image types,
     * so a mismatched Content-Type leaves req.body as a plain object rather than
     * a Buffer — which is the 415 below, not a crash.
     */
    router.put('/vehicles/:vehicleId/photo', express.raw({ type: ACCEPTED_TYPES, limit: MAX_PHOTO_BYTES }), (req, res) => {
        const vehicleId = id(req, 'vehicleId');
        const existing = vehicleOr404(db, vehicleId);
        if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
            throw new HttpError(415, 'unsupported_image', `Send the image as the request body with one of: ${ACCEPTED_TYPES.join(', ')}`);
        }
        const saved = savePhoto(dataDir, vehicleId, req.body);
        const updated = repo.updateVehicle(db, vehicleId, { photo: saved.url });
        // Saving the same image twice produces the same name, so only unlink the
        // previous file when it really is a different one.
        if (existing.photo !== saved.url)
            removePhoto(dataDir, existing.photo);
        res.status(201).json({ vehicle: updated, photo: saved });
    });
    router.delete('/vehicles/:vehicleId/photo', (req, res) => {
        const vehicleId = id(req, 'vehicleId');
        const existing = vehicleOr404(db, vehicleId);
        const updated = repo.updateVehicle(db, vehicleId, { photo: '' });
        removePhoto(dataDir, existing.photo);
        res.json(updated);
    });
    /** An explicit correction, which unlike a log entry may lower the reading. */
    router.put('/vehicles/:vehicleId/odometer', (req, res) => {
        const vehicleId = id(req, 'vehicleId');
        vehicleOr404(db, vehicleId);
        const reading = optNumber(body(req), 'odometer', { integer: true });
        if (reading === undefined)
            throw badRequest('odometer is required');
        repo.setOdometer(db, vehicleId, reading);
        res.json(repo.getVehicle(db, vehicleId));
    });
    /**
     * Clears a vehicle's history without removing the vehicle.
     *
     * Nothing is cleared unless it is asked for by name, so an empty body is a
     * no-op rather than a surprise.
     */
    router.post('/vehicles/:vehicleId/reset', (req, res) => {
        const vehicleId = id(req, 'vehicleId');
        vehicleOr404(db, vehicleId);
        const src = body(req);
        const components = optEnum(src, 'components', ['keep', 'clear', 'reseed']);
        res.json(repo.resetVehicle(db, vehicleId, {
            log: optBool(src, 'log') ?? false,
            wishlist: optBool(src, 'wishlist') ?? false,
            modifications: optBool(src, 'modifications') ?? false,
            components: components ?? 'keep',
            odometer: optNumber(src, 'odometer', { integer: true }),
        }));
    });
    // ------------------------------------------------------------ components
    router.get('/vehicles/:vehicleId/components', (req, res) => {
        const vehicle = vehicleOr404(db, id(req, 'vehicleId'));
        res.json(repo.listComponents(db, vehicle.id).map((c) => componentState(c, vehicle.odometer)));
    });
    router.post('/vehicles/:vehicleId/components', (req, res) => {
        const vehicle = vehicleOr404(db, id(req, 'vehicleId'));
        const src = body(req);
        const created = repo.createComponent(db, vehicle.id, {
            name: reqString(src, 'name', 80),
            category: optEnum(src, 'category', COMPONENT_CATEGORIES) ?? 'other',
            icon: optString(src, 'icon', 60) ?? '',
            spec: optString(src, 'spec', 200) ?? '',
            qty: optNumber(src, 'qty', { min: 1, max: 99, integer: true }) ?? 1,
            intervalMiles: optNumber(src, 'intervalMiles', { max: 500_000, integer: true }) ?? 0,
            intervalMonths: optNumber(src, 'intervalMonths', { max: 600, integer: true }) ?? 0,
            lastDate: optDate(src, 'lastDate') ?? null,
            lastOdometer: optNumber(src, 'lastOdometer', { integer: true }) ?? null,
            notes: optString(src, 'notes') ?? '',
        });
        res.status(201).json(componentState(created, vehicle.odometer));
    });
    router.patch('/components/:componentId', (req, res) => {
        const componentId = id(req, 'componentId');
        const existing = repo.getComponent(db, componentId);
        if (!existing)
            throw notFound('No such component');
        const src = body(req);
        const updated = repo.updateComponent(db, componentId, {
            name: optString(src, 'name', 80),
            category: optEnum(src, 'category', COMPONENT_CATEGORIES),
            icon: optString(src, 'icon', 60),
            spec: optString(src, 'spec', 200),
            qty: optNumber(src, 'qty', { min: 1, max: 99, integer: true }),
            intervalMiles: optNumber(src, 'intervalMiles', { max: 500_000, integer: true }),
            intervalMonths: optNumber(src, 'intervalMonths', { max: 600, integer: true }),
            lastDate: optDate(src, 'lastDate'),
            lastOdometer: optNumber(src, 'lastOdometer', { integer: true }),
            notes: optString(src, 'notes'),
        });
        const vehicle = repo.getVehicle(db, updated.vehicleId);
        res.json(componentState(updated, vehicle.odometer));
    });
    router.delete('/components/:componentId', (req, res) => {
        if (!repo.deleteComponent(db, id(req, 'componentId')))
            throw notFound('No such component');
        res.status(204).end();
    });
    /** Reset the interval and write the ledger entry in one step. */
    router.post('/components/:componentId/service', (req, res) => {
        const component = repo.getComponent(db, id(req, 'componentId'));
        if (!component)
            throw notFound('No such component');
        const src = body(req);
        const result = repo.serviceComponent(db, component, {
            date: optDate(src, 'date') ?? undefined,
            odometer: optNumber(src, 'odometer', { integer: true }),
            cost: optNumber(src, 'cost', { max: 1_000_000 }),
            parts: optString(src, 'parts', 300),
            note: optString(src, 'note'),
            task: optString(src, 'task', 200),
            category: optString(src, 'category', 40),
        });
        const vehicle = repo.getVehicle(db, component.vehicleId);
        res.status(201).json({
            component: componentState(result.component, vehicle.odometer),
            entry: result.entry,
        });
    });
    // ----------------------------------------------------------- service log
    router.get('/vehicles/:vehicleId/entries', (req, res) => {
        const vehicle = vehicleOr404(db, id(req, 'vehicleId'));
        const limit = optNumber(req.query, 'limit', {
            min: 1, max: 1000, integer: true,
        });
        res.json(repo.listEntries(db, vehicle.id, limit));
    });
    router.post('/vehicles/:vehicleId/entries', (req, res) => {
        const vehicle = vehicleOr404(db, id(req, 'vehicleId'));
        const src = body(req);
        res.status(201).json(repo.createEntry(db, vehicle.id, {
            date: optDate(src, 'date') ?? undefined,
            odometer: optNumber(src, 'odometer', { integer: true }),
            category: optString(src, 'category', 40),
            task: reqString(src, 'task', 200),
            parts: optString(src, 'parts', 300),
            cost: optNumber(src, 'cost', { max: 1_000_000 }),
            note: optString(src, 'note'),
        }));
    });
    router.patch('/entries/:entryId', (req, res) => {
        const entryId = id(req, 'entryId');
        if (!repo.getEntry(db, entryId))
            throw notFound('No such entry');
        const src = body(req);
        res.json(repo.updateEntry(db, entryId, {
            date: optDate(src, 'date') ?? undefined,
            odometer: optNumber(src, 'odometer', { integer: true }),
            category: optString(src, 'category', 40),
            task: optString(src, 'task', 200),
            parts: optString(src, 'parts', 300),
            cost: optNumber(src, 'cost', { max: 1_000_000 }),
            note: optString(src, 'note'),
        }));
    });
    router.delete('/entries/:entryId', (req, res) => {
        if (!repo.deleteEntry(db, id(req, 'entryId')))
            throw notFound('No such entry');
        res.status(204).end();
    });
    // -------------------------------------------------------------- wishlist
    router.get('/vehicles/:vehicleId/wishlist', (req, res) => {
        const vehicle = vehicleOr404(db, id(req, 'vehicleId'));
        res.json(repo.listWishlist(db, vehicle.id));
    });
    router.post('/vehicles/:vehicleId/wishlist', (req, res) => {
        const vehicle = vehicleOr404(db, id(req, 'vehicleId'));
        const src = body(req);
        res.status(201).json(repo.createWishlist(db, vehicle.id, {
            title: reqString(src, 'title', 200),
            detail: optString(src, 'detail'),
            priority: optEnum(src, 'priority', PRIORITIES) ?? 'mechanical',
            estimate: optNumber(src, 'estimate', { max: 1_000_000 }),
        }));
    });
    router.patch('/wishlist/:itemId', (req, res) => {
        const itemId = id(req, 'itemId');
        if (!repo.getWishlist(db, itemId))
            throw notFound('No such wishlist item');
        const src = body(req);
        res.json(repo.updateWishlist(db, itemId, {
            title: optString(src, 'title', 200),
            detail: optString(src, 'detail'),
            priority: optEnum(src, 'priority', PRIORITIES),
            estimate: optNumber(src, 'estimate', { max: 1_000_000 }),
            done: optBool(src, 'done'),
        }));
    });
    router.delete('/wishlist/:itemId', (req, res) => {
        if (!repo.deleteWishlist(db, id(req, 'itemId')))
            throw notFound('No such wishlist item');
        res.status(204).end();
    });
    // --------------------------------------------------------- modifications
    router.get('/vehicles/:vehicleId/modifications', (req, res) => {
        const vehicle = vehicleOr404(db, id(req, 'vehicleId'));
        res.json(repo.listMods(db, vehicle.id));
    });
    router.post('/vehicles/:vehicleId/modifications', (req, res) => {
        const vehicle = vehicleOr404(db, id(req, 'vehicleId'));
        const src = body(req);
        res.status(201).json(repo.createMod(db, vehicle.id, {
            title: reqString(src, 'title', 200),
            detail: optString(src, 'detail'),
            status: optEnum(src, 'status', MOD_STATUSES) ?? 'planned',
            cost: optNumber(src, 'cost', { max: 1_000_000 }),
            date: optDate(src, 'date') ?? undefined,
            reversible: optBool(src, 'reversible'),
        }));
    });
    router.patch('/modifications/:modId', (req, res) => {
        const modId = id(req, 'modId');
        if (!repo.getMod(db, modId))
            throw notFound('No such modification');
        const src = body(req);
        res.json(repo.updateMod(db, modId, {
            title: optString(src, 'title', 200),
            detail: optString(src, 'detail'),
            status: optEnum(src, 'status', MOD_STATUSES),
            cost: optNumber(src, 'cost', { max: 1_000_000 }),
            date: optDate(src, 'date') ?? undefined,
            reversible: optBool(src, 'reversible'),
        }));
    });
    router.delete('/modifications/:modId', (req, res) => {
        if (!repo.deleteMod(db, id(req, 'modId')))
            throw notFound('No such modification');
        res.status(204).end();
    });
    // -------------------------------------------------- Home Assistant bridge
    router.post('/homeassistant/publish', asyncHandler(async (_req, res) => {
        if (!homeAssistant?.available) {
            res.json({ published: 0, available: false });
            return;
        }
        res.json({ ...(await homeAssistant.publish()), available: true });
    }));
    return router;
}
//# sourceMappingURL=api.js.map
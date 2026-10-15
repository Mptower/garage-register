/**
 * Vehicle photographs, stored as files in the data directory.
 *
 * They live under /data because that is the volume Home Assistant's own
 * backups snapshot. The previous design stored a *path* the owner typed in,
 * pointing at /share or at some URL; a restore onto a new machine then brought
 * the database back with every photo reference dangling. Keeping the bytes
 * beside the database means the garage restores whole.
 *
 * Uploads arrive as a raw image body rather than multipart/form-data. A
 * single-file upload needs none of what multipart buys, and avoiding it keeps
 * the add-on's production dependencies at exactly one (express), which is what
 * makes the shipped image small and its lockfile boring.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { HttpError, sendError } from "./http.js";
/** The URL prefix stored in `vehicle.photo`, and the directory name in /data. */
export const PHOTO_PREFIX = 'photos';
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
/** The types the client is allowed to send and the extension each is saved as. */
const ACCEPTED = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
};
export const ACCEPTED_TYPES = Object.keys(ACCEPTED);
/** Stored names are generated, never supplied, so this can be strict. */
const SAFE_NAME = /^v\d+-[0-9a-f]{12}\.(jpg|png|webp)$/;
export function photosDir(dataDir) {
    return path.join(dataDir, PHOTO_PREFIX);
}
/**
 * Identifies the content type from the bytes themselves.
 *
 * The Content-Type header is the client's claim about the body, not a fact
 * about it. Trusting it would let a caller store an arbitrary file under an
 * image extension, which is then served back from our own origin.
 */
export function sniff(buffer) {
    if (buffer.length < 12)
        return null;
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return 'image/jpeg';
    }
    if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
        return 'image/png';
    }
    if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
        return 'image/webp';
    }
    return null;
}
/**
 * True for a value this module owns and may delete.
 *
 * `vehicle.photo` is deliberately still a free string, so an owner can point
 * at an external URL instead. Only values matching the stored shape are ever
 * unlinked — an http:// one must never be treated as a file path.
 */
export function isStoredPhoto(value) {
    return storedFilename(value) !== null;
}
export function storedFilename(value) {
    if (typeof value !== 'string' || !value.startsWith(`${PHOTO_PREFIX}/`))
        return null;
    const name = value.slice(PHOTO_PREFIX.length + 1);
    return SAFE_NAME.test(name) ? name : null;
}
export function savePhoto(dataDir, vehicleId, buffer) {
    const type = sniff(buffer);
    if (!type) {
        // An HttpError specifically: the error handler only recognises these and
        // body-parser's own failures, so a plain thrown object would reach the
        // client as a 500 with a stack trace instead of a readable 415.
        throw new HttpError(415, 'unsupported_image', 'That file is not a JPEG, PNG or WebP image.');
    }
    const directory = photosDir(dataDir);
    fs.mkdirSync(directory, { recursive: true });
    // Hashing the content means replacing a photo always changes its URL, so the
    // immutable cache headers below are safe and the browser never shows the
    // previous car after an edit.
    const digest = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 12);
    const filename = `v${vehicleId}-${digest}.${ACCEPTED[type]}`;
    // Written to a temporary name first: a half-written file that already has
    // its final name would be served, and being content-addressed it would never
    // be replaced by a correct copy. The leading dot is what keeps the partial
    // out of reach, via `dotfiles: 'deny'` on the static mount below.
    const target = path.join(directory, filename);
    const temporary = path.join(directory, `.${filename}.${process.pid}.tmp`);
    fs.writeFileSync(temporary, buffer);
    fs.renameSync(temporary, target);
    return { url: `${PHOTO_PREFIX}/${filename}`, filename, type, bytes: buffer.length };
}
/**
 * Deletes a stored photo, ignoring anything this module does not own.
 *
 * Never throws: a missing file means the desired state already holds, and a
 * failure to tidy up must not fail the edit the owner actually asked for.
 */
export function removePhoto(dataDir, value) {
    const filename = storedFilename(value);
    if (!filename)
        return false;
    try {
        fs.unlinkSync(path.join(photosDir(dataDir), filename));
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Serves stored photos.
 *
 * Mounted before the client, whose catch-all route hands back index.html for
 * anything outside /api.
 *
 * Order alone is not enough, though: express.static defaults to
 * `fallthrough: true`, so a photo it cannot serve — missing, or denied for
 * being a dotfile — calls next() and lands on that same catch-all. The result
 * is index.html returned with HTTP 200 and Content-Type text/html, which an
 * <img> renders as a broken image after downloading the entire application.
 * The terminal handler below is what makes a missing photo say so.
 */
export function mountPhotos(app, dataDir, basePath) {
    const directory = photosDir(dataDir);
    fs.mkdirSync(directory, { recursive: true });
    const mountAt = `${basePath}/${PHOTO_PREFIX}`;
    app.use(mountAt, express.static(directory, {
        index: false,
        // Content-addressed, so a given URL's bytes can never change.
        maxAge: '1y',
        immutable: true,
        // Keeps partially written uploads, which are dot-prefixed, unreachable.
        dotfiles: 'deny',
        setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
    }));
    app.use(mountAt, (req, res) => {
        // A denied dotfile arrives here too, and is answered the same way: there
        // is no reason to confirm that a partial upload briefly existed.
        sendError(res, 404, 'not_found', `No such photo: ${req.path}`);
    });
}
//# sourceMappingURL=photos.js.map
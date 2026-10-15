/**
 * Photo upload, storage and cleanup.
 *
 * The behaviour worth protecting is mostly about what happens to the *file*
 * when the row changes: an orphan in /data is invisible until the volume fills
 * up, and a deleted file whose row still points at it shows as a broken image.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

import { createApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { closeDatabase, openDatabase } from '../src/db/open.ts';
import type { Database } from '../src/db/open.ts';
import { isStoredPhoto, photosDir, sniff, storedFilename } from '../src/photos.ts';

let db: Database;
let base: string;
let origin: string;
let dataDir: string;
let clientDir: string;
let server: ReturnType<ReturnType<typeof createApp>['app']['listen']>;

/** A real 1x1 image of each type, so the magic-byte check sees the truth. */
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
    'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

before(async () => {
  db = openDatabase({ file: ':memory:', ensureDir: false });
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grg-photos-'));

  // A real client build, because the bug this suite exists to catch only
  // appears when one is mounted: the SPA catch-all answers anything outside
  // /api, so without a client the fallthrough never happens and a missing
  // photo looks correctly like a 404 when in production it was HTML and a 200.
  clientDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grg-client-'));
  fs.writeFileSync(
    path.join(clientDir, 'index.html'),
    '<!doctype html><html><head><title>The Garage</title></head><body></body></html>',
  );

  const config = loadConfig({
    NODE_ENV: 'test',
    SERVE_CLIENT: 'true',
    CLIENT_DIR: clientDir,
    BASE_PATH: '/',
    DATA_DIR: dataDir,
  });
  const { app, clientMounted } = createApp({ db, config });
  assert.equal(clientMounted, true, 'the fallthrough cases need a client');

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${port}`;
  base = `${origin}/api`;
});

after(() => {
  server?.close();
  closeDatabase(db);
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.rmSync(clientDir, { recursive: true, force: true });
});

async function newVehicle() {
  const res = await fetch(`${base}/vehicles`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ year: 1949, make: 'Plymouth', model: 'Special Deluxe' }),
  });
  return (await res.json()) as { id: number };
}

async function upload(vehicleId: number, body: Buffer | string, type = 'image/jpeg') {
  const res = await fetch(`${base}/vehicles/${vehicleId}/photo`, {
    method: 'PUT',
    headers: { 'content-type': type },
    body: body as BodyInit,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const stored = (name: string) => path.join(photosDir(dataDir), name);

// ------------------------------------------------------------------- sniffing
test('the content type is read from the bytes, not the header', () => {
  assert.equal(sniff(JPEG), 'image/jpeg');
  assert.equal(sniff(PNG), 'image/png');
  assert.equal(sniff(Buffer.from('#!/bin/sh\necho hello world\n')), null);
  assert.equal(sniff(Buffer.alloc(4)), null, 'too short to identify');
});

test('only generated names count as ours to delete', () => {
  assert.equal(isStoredPhoto('photos/v1-0123456789ab.jpg'), true);
  assert.equal(isStoredPhoto('https://example.com/car.jpg'), false);
  assert.equal(isStoredPhoto('/share/car.jpg'), false);
  assert.equal(isStoredPhoto(''), false);
  assert.equal(isStoredPhoto(null), false);
  // Traversal, dressed up as one of ours.
  assert.equal(storedFilename('photos/../../data/garage.db'), null);
  assert.equal(storedFilename('photos/v1-nothex......jpg'), null);
});

// ------------------------------------------------------------------ uploading
test('an uploaded photo is stored, served, and recorded on the vehicle', async () => {
  const vehicle = await newVehicle();
  const { status, body } = await upload(vehicle.id, JPEG);

  assert.equal(status, 201);
  assert.match(body.photo.url, /^photos\/v\d+-[0-9a-f]{12}\.jpg$/);
  assert.equal(body.vehicle.photo, body.photo.url);
  assert.ok(fs.existsSync(stored(body.photo.filename)), 'the file is on disk');

  // The URL is relative, which is what makes it work under ingress.
  assert.ok(!body.photo.url.startsWith('/'));

  const served = await fetch(`${origin}/${body.photo.url}`);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'image/jpeg');
  assert.equal(Buffer.from(await served.arrayBuffer()).equals(JPEG), true);
});

test('a missing photo is a 404, not the client shell', async () => {
  // express.static falls through on a miss, so without a terminal handler the
  // SPA catch-all answers with index.html and HTTP 200. An <img> then renders
  // a broken image having downloaded the whole application to do it.
  const res = await fetch(`${origin}/photos/v99-ffffffffffff.jpg`);
  const type = res.headers.get('content-type') ?? '';
  assert.equal(res.status, 404, 'a missing photo must not be a 200');
  assert.ok(!type.includes('html'), `served ${type} instead of an error`);
  assert.equal((await res.json()).error.code, 'not_found');
});

test('a partially written upload is never reachable', async () => {
  // Uploads land under a dot-prefixed temporary name before being renamed, so
  // a crash mid-write could leave one behind. It must not be servable, and the
  // answer must not reveal whether it is there.
  const vehicle = await newVehicle();
  const partial = path.join(photosDir(dataDir), `.v${vehicle.id}-abcdefabcdef.jpg.1.tmp`);
  fs.writeFileSync(partial, JPEG);

  const res = await fetch(`${origin}/photos/${path.basename(partial)}`);
  assert.equal(res.status, 404);
  assert.ok(!(res.headers.get('content-type') ?? '').includes('html'));
  fs.rmSync(partial, { force: true });
});

test('the client is still served for an ordinary route', async () => {
  // The guard above must not have broken the thing it sits in front of.
  const res = await fetch(`${origin}/wishlist`);
  assert.equal(res.status, 200);
  assert.ok((res.headers.get('content-type') ?? '').includes('html'));
});

test('a file that is not an image is refused whatever it claims to be', async () => {
  const vehicle = await newVehicle();
  const { status, body } = await upload(vehicle.id, Buffer.from('#!/bin/sh\nrm -rf /\n'));
  assert.equal(status, 415);
  assert.equal(body.error.code, 'unsupported_image');
});

test('a body sent as some other type is refused, not crashed on', async () => {
  // text/plain matches neither the JSON parser nor the raw image parser, so
  // req.body arrives as a plain object and the route's own guard answers.
  const vehicle = await newVehicle();
  const { status, body } = await upload(vehicle.id, JPEG, 'text/plain');
  assert.equal(status, 415);
  assert.equal(body.error.code, 'unsupported_image');
});

test('an image mislabelled as JSON fails as bad JSON, which is what it is', async () => {
  // The global JSON parser claims application/json before the route is
  // reached, so this surfaces as invalid_json rather than unsupported_image.
  // Worth pinning: the client must set a real image type, and the failure it
  // gets when it does not should stay a 4xx rather than becoming a 500.
  const vehicle = await newVehicle();
  const { status, body } = await upload(vehicle.id, JPEG, 'application/json');
  assert.equal(status, 400);
  assert.equal(body.error.code, 'invalid_json');
});

test('uploading to a vehicle that does not exist is a 404', async () => {
  const { status } = await upload(99_999, JPEG);
  assert.equal(status, 404);
});

// ------------------------------------------------------------------- cleanup
test('replacing a photo removes the file it replaced', async () => {
  const vehicle = await newVehicle();
  const first = (await upload(vehicle.id, JPEG)).body.photo;
  const second = (await upload(vehicle.id, PNG)).body.photo;

  assert.notEqual(first.filename, second.filename);
  assert.equal(fs.existsSync(stored(first.filename)), false, 'the old file is gone');
  assert.equal(fs.existsSync(stored(second.filename)), true);
});

test('re-uploading the identical image keeps the file it already had', async () => {
  // Names are content-addressed, so the second upload resolves to the same
  // file. Unlinking "the previous one" here would delete the live photo.
  const vehicle = await newVehicle();
  const first = (await upload(vehicle.id, JPEG)).body.photo;
  const again = (await upload(vehicle.id, JPEG)).body.photo;

  assert.equal(first.filename, again.filename);
  assert.equal(fs.existsSync(stored(again.filename)), true, 'still there');
});

test('clearing the photo removes the file', async () => {
  const vehicle = await newVehicle();
  const { filename } = (await upload(vehicle.id, JPEG)).body.photo;

  const res = await fetch(`${base}/vehicles/${vehicle.id}/photo`, { method: 'DELETE' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).photo, '');
  assert.equal(fs.existsSync(stored(filename)), false);
});

test('deleting the vehicle removes its photo too', async () => {
  const vehicle = await newVehicle();
  const { filename } = (await upload(vehicle.id, JPEG)).body.photo;

  const res = await fetch(`${base}/vehicles/${vehicle.id}`, { method: 'DELETE' });
  assert.equal(res.status, 204);
  assert.equal(fs.existsSync(stored(filename)), false, 'no orphan left in /data');
});

test('pointing the vehicle at an external URL drops the file it was using', async () => {
  const vehicle = await newVehicle();
  const { filename } = (await upload(vehicle.id, JPEG)).body.photo;

  const res = await fetch(`${base}/vehicles/${vehicle.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ photo: 'https://example.com/plymouth.jpg' }),
  });
  assert.equal(res.status, 200);
  assert.equal(fs.existsSync(stored(filename)), false);
});

test('an external URL is left alone when the vehicle changes', async () => {
  // Nothing to unlink, and nothing that could be mistaken for a path.
  const vehicle = await newVehicle();
  await fetch(`${base}/vehicles/${vehicle.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ photo: 'https://example.com/plymouth.jpg' }),
  });
  const res = await fetch(`${base}/vehicles/${vehicle.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ plate: '49312' }),
  });
  assert.equal((await res.json()).photo, 'https://example.com/plymouth.jpg');
});

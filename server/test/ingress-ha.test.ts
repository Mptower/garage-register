/**
 * The ingress and Home Assistant edges, which are the parts that only
 * misbehave once they are actually running inside Supervisor.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normaliseBasePath } from '../src/config.ts';
import { closeDatabase, openDatabase } from '../src/db/open.ts';
import * as repo from '../src/db/repo.ts';
import { HomeAssistantBridge, slugify } from '../src/ha/bridge.ts';
import { __testing } from '../src/static.ts';

const { withBaseHref, ingressBase } = __testing;

const req = (header?: string) =>
  ({ header: (name: string) => (name === 'x-ingress-path' ? header : undefined) }) as never;

// --------------------------------------------------------------- base paths
test('normaliseBasePath collapses the root to an empty prefix', () => {
  assert.equal(normaliseBasePath('/'), '');
  assert.equal(normaliseBasePath(''), '');
  assert.equal(normaliseBasePath(undefined), '');
  assert.equal(normaliseBasePath('/garage'), '/garage');
  assert.equal(normaliseBasePath('garage'), '/garage');
  assert.equal(normaliseBasePath('/garage/'), '/garage');
});

test('the ingress prefix is taken from the header and always ends in a slash', () => {
  assert.equal(
    ingressBase(req('/api/hassio_ingress/abc123'), ''),
    '/api/hassio_ingress/abc123/',
  );
  assert.equal(
    ingressBase(req('/api/hassio_ingress/abc123/'), ''),
    '/api/hassio_ingress/abc123/',
  );
});

test('without the header the base falls back to the configured path', () => {
  assert.equal(ingressBase(req(undefined), ''), '/');
  assert.equal(ingressBase(req(undefined), '/garage'), '/garage/');
});

test('a header that is not a plain path is ignored', () => {
  // Reflecting "//evil.example" would turn <base> into a protocol-relative URL
  // and send every asset request off-host.
  assert.equal(ingressBase(req('//evil.example'), ''), '/');
  assert.equal(ingressBase(req('https://evil.example/'), ''), '/');
  assert.equal(ingressBase(req('no-leading-slash'), ''), '/');
});

// ------------------------------------------------------------- base href tag
test('a base href is injected into head when absent', () => {
  const html = withBaseHref('<html><head><title>x</title></head></html>', '/ingress/1/');
  assert.match(html, /<base href="\/ingress\/1\/">/);
  assert.ok(html.indexOf('<base') < html.indexOf('<title>'), 'must precede asset URLs');
});

test('an existing base href is replaced, not duplicated', () => {
  const html = withBaseHref(
    '<html><head><base href="/old/"><title>x</title></head></html>',
    '/new/',
  );
  assert.equal(html.match(/<base /g)?.length, 1);
  assert.match(html, /<base href="\/new\/">/);
});

test('a head with attributes is still matched', () => {
  const html = withBaseHref('<html><head lang="en"><title>x</title></head></html>', '/p/');
  assert.match(html, /<base href="\/p\/">/);
});

test('a comment mentioning <base href> is not mistaken for the tag', () => {
  // index.html documents this very mechanism, and the comment used to be
  // rewritten instead of the real tag, leaving every asset to 404 on ingress.
  const html = withBaseHref(
    `<html><head>
      <!-- The server rewrites <base href> from the X-Ingress-Path header. -->
      <base href="/" />
    </head></html>`,
    '/api/hassio_ingress/AbC123/',
  );

  assert.match(html, /<base href="\/api\/hassio_ingress\/AbC123\/">/, 'the real tag is rewritten');
  assert.match(html, /<!-- The server rewrites <base href> from/, 'the comment is left alone');
  assert.doesNotMatch(
    html,
    /<!--[^>]*AbC123/,
    'the prefix must not be written into the comment',
  );
});

test('a commented-out base tag does not absorb the rewrite', () => {
  const html = withBaseHref(
    '<html><head><!-- <base href="/old/"> --><base href="/"></head></html>',
    '/new/',
  );
  assert.match(html, /<base href="\/new\/">/);
  assert.match(html, /<!-- <base href="\/old\/"> -->/, 'the commented tag is preserved verbatim');
});

// --------------------------------------------------------------- entity ids
test('slugify produces stable, readable entity suffixes', () => {
  assert.equal(slugify('1949 Plymouth Special Deluxe'), '1949_plymouth_special_deluxe');
  assert.equal(slugify('  Citroën  2CV  '), 'citroen_2cv');
  assert.equal(slugify('!!!'), 'vehicle', 'never yields an empty entity id');
});

// ------------------------------------------------------- Home Assistant edge
test('with no token the bridge is unavailable and publishes nothing', async () => {
  const db = openDatabase({ file: ':memory:', ensureDir: false });
  const bridge = new HomeAssistantBridge({
    token: null, baseUrl: 'http://supervisor/core/api',
    sensorPrefix: 'garage', notifyService: '',
  });

  assert.equal(bridge.available, false);
  assert.deepEqual(await bridge.publishAll(db), { published: 0 });
  // Must not throw just because there is nobody to notify.
  await bridge.notify('x', 'y');
  closeDatabase(db);
});

test('publishing posts four sensors per vehicle to the states API', async () => {
  const db = openDatabase({ file: ':memory:', ensureDir: false });
  const vehicle = repo.createVehicle(db, {
    year: 1949, make: 'Plymouth', model: 'Special Deluxe', odometer: 48_312,
  });
  repo.createComponent(db, vehicle.id, {
    name: 'Engine Oil', category: 'fluid', intervalMonths: 6, lastDate: '2020-01-01',
  });

  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init.body)) });
    return new Response('{}', { status: 200 });
  }) as typeof fetch;

  try {
    const bridge = new HomeAssistantBridge({
      token: 'tok', baseUrl: 'http://supervisor/core/api',
      sensorPrefix: 'garage', notifyService: '',
    });
    const result = await bridge.publishAll(db);

    assert.equal(result.published, 4);
    assert.ok(
      calls.every((c) => c.url.includes('/states/sensor.garage_1949_plymouth_special_deluxe_')),
      'entity ids carry the configured prefix and the vehicle slug',
    );
    assert.ok(calls.some((c) => c.url.endsWith('_odometer')));

    const attention = calls.find((c) => c.url.endsWith('_attention'))!;
    assert.equal(attention.body.state, 1, 'one overdue component');
    assert.deepEqual(
      (attention.body.attributes as Record<string, unknown>).overdue,
      ['Engine Oil'],
      'the reason travels with the count',
    );
  } finally {
    globalThis.fetch = original;
    closeDatabase(db);
  }
});

test('a Supervisor error surfaces rather than being swallowed', async () => {
  const db = openDatabase({ file: ':memory:', ensureDir: false });
  repo.createVehicle(db, { year: 1949, make: 'Plymouth', model: 'Deluxe' });

  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response('nope', { status: 401 })) as typeof fetch;

  try {
    const bridge = new HomeAssistantBridge({
      token: 'bad', baseUrl: 'http://supervisor/core/api',
      sensorPrefix: 'garage', notifyService: '',
    });
    await assert.rejects(() => bridge.publishAll(db), /401/);
  } finally {
    globalThis.fetch = original;
    closeDatabase(db);
  }
});

test('notify strips a notify. prefix so either spelling works', async () => {
  const urls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    urls.push(String(url));
    return new Response('{}', { status: 200 });
  }) as typeof fetch;

  try {
    for (const configured of ['notify.mobile_app_phone', 'mobile_app_phone']) {
      await new HomeAssistantBridge({
        token: 'tok', baseUrl: 'http://supervisor/core/api',
        sensorPrefix: 'garage', notifyService: configured,
      }).notify('Garage', 'Oil overdue');
    }
    assert.equal(urls.length, 2);
    assert.ok(urls.every((u) => u.endsWith('/services/notify/mobile_app_phone')));
  } finally {
    globalThis.fetch = original;
  }
});

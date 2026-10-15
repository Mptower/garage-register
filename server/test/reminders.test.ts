/**
 * The reminder scheduler and its persistence.
 *
 * The pure selection and de-duplication logic is covered in the shared
 * package. What is tested here is the part that touches the world: running at
 * most once a day across restarts, and not recording a send that failed.
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { SETTING_KEYS } from '@grg/shared';

import { closeDatabase, openDatabase } from '../src/db/open.ts';
import type { Database } from '../src/db/open.ts';
import * as repo from '../src/db/repo.ts';
import { previewReminders, runReminderCheck, startReminderSchedule } from '../src/reminders.ts';

interface Sent {
  title: string;
  message: string;
}

function bridge(options: { available?: boolean; notifyConfigured?: boolean; fail?: boolean } = {}) {
  const sent: Sent[] = [];
  return {
    sent,
    available: options.available ?? true,
    notifyConfigured: options.notifyConfigured ?? true,
    notify: async (title: string, message: string) => {
      if (options.fail) throw new Error('Home Assistant said no');
      sent.push({ title, message });
    },
  };
}

let db: Database;

/** An overdue oil change: 3,312 miles covered against a 1,500 mile interval. */
function garage(): void {
  const vehicle = repo.createVehicle(db, {
    year: 1949, make: 'Plymouth', model: 'Special Deluxe', odometer: 48_312,
    registrationPermanent: true,
  });
  repo.createComponent(db, vehicle.id, {
    name: 'Engine Oil',
    category: 'fluid',
    intervalMiles: 1500,
    intervalMonths: 0,
    lastDate: '2026-04-01',
    lastOdometer: 45_000,
  });
}

function enable(extra: Record<string, string> = {}): void {
  repo.setSetting(db, SETTING_KEYS.remindersEnabled, 'true');
  for (const [key, value] of Object.entries(extra)) repo.setSetting(db, key, value);
}

beforeEach(() => {
  if (db) closeDatabase(db);
  db = openDatabase({ file: ':memory:', ensureDir: false });
});

describe('sending', () => {
  test('nothing is sent while reminders are switched off', async () => {
    garage();
    const ha = bridge();
    const result = await runReminderCheck(db, ha);
    assert.equal(result.sent, false);
    assert.equal(result.decision.reason, 'disabled');
    assert.equal(ha.sent.length, 0);
  });

  test('an overdue component is reported once and then left alone', async () => {
    garage();
    enable();
    const ha = bridge();

    const first = await runReminderCheck(db, ha);
    assert.equal(first.sent, true);
    assert.equal(ha.sent.length, 1);
    assert.match(ha.sent[0].title, /1 overdue/);
    assert.match(ha.sent[0].message, /Engine Oil/);

    const second = await runReminderCheck(db, ha);
    assert.equal(second.sent, false);
    assert.equal(second.decision.reason, 'already_reported');
    assert.equal(ha.sent.length, 1, 'the same news must not be sent twice');
  });

  test('a failed send is not recorded, so it is tried again', async () => {
    // Recording first would mean a notification lost to a restarting
    // Supervisor was never retried, and the owner heard nothing at all.
    garage();
    enable();

    await assert.rejects(() => runReminderCheck(db, bridge({ fail: true })));
    assert.equal(repo.getSetting(db, SETTING_KEYS.remindersLastSentAt), null);

    const ha = bridge();
    const retry = await runReminderCheck(db, ha);
    assert.equal(retry.sent, true);
    assert.equal(ha.sent.length, 1);
  });

  test('a test send ignores both the switch and the de-duplication', async () => {
    garage();
    const ha = bridge();

    // Off, and never sent: a normal check would do nothing at all.
    const forced = await runReminderCheck(db, ha, { force: true });
    assert.equal(forced.sent, true);
    assert.equal(ha.sent.length, 1);

    // And it must not count as having been reported, or the real reminder
    // would be suppressed by a button press.
    assert.equal(repo.getSetting(db, SETTING_KEYS.remindersLastKeys), null);
  });

  test('with no notify service configured nothing is sent, and it says so', async () => {
    garage();
    enable();
    const ha = bridge({ notifyConfigured: false });

    const result = await runReminderCheck(db, ha);
    assert.equal(result.sent, false);
    assert.equal(result.blocked, 'no_notify_service');
    assert.equal(ha.sent.length, 0);
    // The digest is still computed, so the Settings screen can show it.
    assert.ok(result.digest);
  });

  test('without Home Assistant the preview still works', async () => {
    garage();
    enable();
    const report = previewReminders(db, null);
    assert.equal(report.blocked, 'no_home_assistant');
    assert.equal(report.items.length, 1);
  });
});

describe('scheduling', () => {
  test('the check runs only at the configured hour', async () => {
    garage();
    enable({ [SETTING_KEYS.remindersHour]: '8' });
    const ha = bridge();
    const schedule = startReminderSchedule(db, ha);

    await schedule.tick(new Date(2026, 9, 14, 7, 59));
    assert.equal(ha.sent.length, 0, 'too early');

    await schedule.tick(new Date(2026, 9, 14, 8, 5));
    assert.equal(ha.sent.length, 1);
    schedule.stop();
  });

  test('a restart inside the same hour does not run it again', async () => {
    // The add-on restarts on every update and every backup. An in-memory
    // "already ran today" would forget, and the owner would be told twice.
    garage();
    enable({ [SETTING_KEYS.remindersHour]: '8' });
    const ha = bridge();

    const first = startReminderSchedule(db, ha);
    await first.tick(new Date(2026, 9, 14, 8, 0));
    first.stop();
    assert.equal(ha.sent.length, 1);

    const afterRestart = startReminderSchedule(db, ha);
    await afterRestart.tick(new Date(2026, 9, 14, 8, 30));
    afterRestart.stop();

    assert.equal(ha.sent.length, 1, 'the day was already checked');
  });

  test('the next day is checked again', async () => {
    garage();
    enable({ [SETTING_KEYS.remindersHour]: '8', [SETTING_KEYS.remindersRepeatDays]: '1' });
    const ha = bridge();
    const schedule = startReminderSchedule(db, ha);

    await schedule.tick(new Date(2026, 9, 14, 8, 0));
    assert.equal(ha.sent.length, 1);

    await schedule.tick(new Date(2026, 9, 15, 8, 0));
    assert.equal(ha.sent.length, 2, 'still outstanding a day later, and repeatDays is 1');
    schedule.stop();
  });

  test('a scheduler failure never propagates', async () => {
    // A reminder is a convenience; it must not be able to take the garage down.
    garage();
    enable({ [SETTING_KEYS.remindersHour]: '8' });
    const schedule = startReminderSchedule(db, bridge({ fail: true }));
    await schedule.tick(new Date(2026, 9, 14, 8, 0));
    schedule.stop();
  });
});

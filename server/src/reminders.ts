/**
 * The daily reminder check.
 *
 * Deliberately thin: everything about *what* is due and *whether* to say it
 * again lives in the shared package, where it can be tested without a clock.
 * What is left here is reading the garage, persisting what was last sent, and
 * handing the digest to Home Assistant.
 *
 * All state is kept in the settings table rather than in memory, because the
 * add-on restarts whenever it is updated or Home Assistant is backed up. An
 * in-memory "already sent today" would forget on every restart and could
 * notify repeatedly on a busy day.
 */
import {
  SETTING_KEYS, collectReminders, componentState, decideSend, formatDigest,
  readReminderSettings, toISO,
} from '@grg/shared';
import type { ReminderItem, ReminderSettings, ReminderVehicle, SendDecision } from '@grg/shared';

import type { Database } from './db/open.ts';
import * as repo from './db/repo.ts';

export interface ReminderBridge {
  available: boolean;
  notifyConfigured: boolean;
  notify: (title: string, message: string) => Promise<void>;
}

export interface ReminderReport {
  settings: ReminderSettings;
  items: ReminderItem[];
  decision: SendDecision;
  /** Null when there is nothing to say. */
  digest: { title: string; message: string } | null;
  /** Why a send could not happen even if one was wanted. */
  blocked: 'no_home_assistant' | 'no_notify_service' | null;
}

function garageName(db: Database): string {
  return repo.getSetting(db, SETTING_KEYS.garageName) || 'The Garage';
}

/** The whole garage, shaped for the pure reminder logic. */
export function reminderVehicles(db: Database, now?: Date): ReminderVehicle[] {
  return repo.listVehicles(db).map((vehicle) => ({
    id: vehicle.id,
    name: `${vehicle.year} ${vehicle.make} ${vehicle.model}`.trim(),
    components: repo
      .listComponents(db, vehicle.id)
      .map((component) => componentState(component, vehicle.odometer, now)),
    registrationPermanent: vehicle.registrationPermanent,
    registrationExpires: vehicle.registrationExpires,
    insuranceRenews: vehicle.insuranceRenews,
  }));
}

/** What a check right now would find, without sending or recording anything. */
export function previewReminders(
  db: Database,
  bridge: ReminderBridge | null,
  now: Date = new Date(),
): ReminderReport {
  const raw = repo.allSettings(db);
  const settings = readReminderSettings(raw);
  const items = collectReminders(reminderVehicles(db, now), settings, now);

  let previousKeys: string[] = [];
  try {
    const stored = raw[SETTING_KEYS.remindersLastKeys];
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    if (Array.isArray(parsed)) previousKeys = parsed.filter((k): k is string => typeof k === 'string');
  } catch {
    // A corrupt record means "nothing was sent", which errs towards telling
    // the owner something twice rather than not at all.
    previousKeys = [];
  }

  const lastSentRaw = raw[SETTING_KEYS.remindersLastSentAt];
  const lastSentAt = lastSentRaw ? new Date(lastSentRaw) : null;
  const decision = decideSend(
    items,
    settings,
    previousKeys,
    lastSentAt && !Number.isNaN(lastSentAt.getTime()) ? lastSentAt : null,
    now,
  );

  let blocked: ReminderReport['blocked'] = null;
  if (!bridge?.available) blocked = 'no_home_assistant';
  else if (!bridge.notifyConfigured) blocked = 'no_notify_service';

  return {
    settings,
    items,
    decision,
    digest: items.length > 0 ? formatDigest(items, garageName(db)) : null,
    blocked,
  };
}

/**
 * Runs a check and sends if one is warranted.
 *
 * `force` is the Settings screen's "send a test": it ignores both the enabled
 * flag and the de-duplication, because the owner has just asked for it
 * explicitly and an unexplained silence would read as a broken feature.
 */
export async function runReminderCheck(
  db: Database,
  bridge: ReminderBridge | null,
  { force = false, now = new Date() }: { force?: boolean; now?: Date } = {},
): Promise<ReminderReport & { sent: boolean }> {
  const report = previewReminders(db, bridge, now);

  const wants = force ? report.items.length > 0 : report.decision.send;
  if (!wants || report.digest === null) return { ...report, sent: false };

  if (!bridge?.available || !bridge.notifyConfigured) {
    return { ...report, sent: false };
  }

  await bridge.notify(report.digest.title, report.digest.message);

  // Recorded only after the send actually succeeded. Writing it first would
  // mean a failed notification was never retried, and the owner would hear
  // nothing until the item escalated or the repeat window elapsed.
  if (!force) {
    repo.setSetting(db, SETTING_KEYS.remindersLastSentAt, now.toISOString());
    repo.setSetting(
      db,
      SETTING_KEYS.remindersLastKeys,
      JSON.stringify(report.items.map((i) => i.key)),
    );
  }

  return { ...report, sent: true };
}

/**
 * Starts the once-a-day check.
 *
 * Polls rather than scheduling a single timer at the target hour: a long timer
 * drifts across a daylight-saving change and silently fires an hour out, and
 * the add-on is restarted often enough that a 15 minute poll costs nothing.
 *
 * Note that "the hour" is local to the container. Supervisor passes the Home
 * Assistant timezone through as TZ, and Node carries its own timezone
 * database, so this is the owner's morning rather than UTC. Without TZ the
 * container is UTC and the check simply runs at the UTC hour.
 */
export function startReminderSchedule(
  db: Database,
  bridge: ReminderBridge | null,
  { intervalMs = 15 * 60 * 1000 }: { intervalMs?: number } = {},
): { stop: () => void; tick: (now?: Date) => Promise<void> } {
  async function tick(now: Date = new Date()): Promise<void> {
    try {
      const settings = readReminderSettings(repo.allSettings(db));
      if (!settings.enabled) return;
      if (now.getHours() !== settings.hour) return;

      // One evaluation per local day, so a restart inside the target hour does
      // not run the check again.
      const todayLocal = toISO(now);
      if (repo.getSetting(db, SETTING_KEYS.remindersLastCheckOn) === todayLocal) return;
      repo.setSetting(db, SETTING_KEYS.remindersLastCheckOn, todayLocal);

      const result = await runReminderCheck(db, bridge, { now });
      if (result.sent) {
        console.log(`[garage-register] reminder sent: ${result.digest?.title}`);
      } else if (result.blocked) {
        console.warn(`[garage-register] reminder not sent: ${result.blocked}`);
      }
    } catch (error) {
      // A reminder failure must never take the garage down with it.
      console.warn(`[garage-register] reminder check failed: ${(error as Error).message}`);
    }
  }

  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  return { stop: () => clearInterval(timer), tick };
}

/**
 * The Settings screen.
 *
 * This exists because reminders are otherwise invisible: a feature that
 * silently decides not to notify you is indistinguishable from a broken one.
 * So alongside the switches it shows exactly what a check right now would
 * find, whether it would be sent, and if not, why.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, Archive, ArchiveRestore, BellRing, CheckCircle2, Clock, Send,
  Settings as SettingsIcon,
} from 'lucide-react';

import type { ReminderSettings } from '@grg/shared';

import { Card, Empty, ErrorNote, Field, Pill, SectionRule, Toggle } from './components/ui.tsx';
import { api } from './lib/api.ts';
import type { ReminderReport, VehicleSummary } from './lib/api.ts';

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function hourLabel(hour: number): string {
  if (hour === 0) return '12 midnight';
  if (hour === 12) return '12 noon';
  return hour < 12 ? `${hour} am` : `${hour - 12} pm`;
}

/** Why nothing would be sent, in the owner's terms rather than the code's. */
function explain(report: ReminderReport): { tone: 'ok' | 'warn' | 'info'; text: string } {
  if (report.blocked === 'no_home_assistant') {
    return {
      tone: 'warn',
      text: 'Running without Home Assistant, so nothing can be sent. This is normal on a laptop.',
    };
  }
  if (report.blocked === 'no_notify_service') {
    return {
      tone: 'warn',
      text:
        'No notify service is set. Add one to notify_service in the add-on’s configuration — ' +
        'that is the only reminder setting that lives there, because it depends on what your ' +
        'phone’s notify service is called.',
    };
  }
  if (!report.settings.enabled) {
    return { tone: 'info', text: 'Reminders are switched off, so nothing will be sent.' };
  }
  if (report.items.length === 0) {
    return { tone: 'ok', text: 'Nothing is due. Nothing would be sent.' };
  }
  if (report.wouldSend) {
    return { tone: 'warn', text: 'There is something new here; this would be sent at the next check.' };
  }
  return {
    tone: 'info',
    text: `Already reported. It will be raised again after ${report.settings.repeatDays} days if still outstanding.`,
  };
}

export function Settings({ onGarageChanged }: { onGarageChanged?: () => Promise<void> | void }) {
  const [report, setReport] = useState<ReminderReport | null>(null);
  const [draft, setDraft] = useState<ReminderSettings | null>(null);
  const [garageName, setGarageName] = useState('');
  const [archived, setArchived] = useState<VehicleSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [next, settings, all] = await Promise.all([
      api.reminders(),
      api.settings(),
      api.allVehicles(),
    ]);
    setReport(next);
    setDraft(next.settings);
    setGarageName(settings['garage.name'] ?? '');
    setArchived(all.filter((vehicle) => vehicle.archived));
  }, []);

  useEffect(() => {
    void load().catch((cause: unknown) =>
      setError(cause instanceof Error ? cause.message : String(cause)),
    );
  }, [load]);

  const save = async (patch: Partial<ReminderSettings>, name = garageName) => {
    if (!draft) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    setSaving(true);
    setError(null);
    try {
      await api.saveSettings({
        'reminders.enabled': String(next.enabled),
        'reminders.hour': String(next.hour),
        'reminders.leadDays': String(next.leadDays),
        'reminders.includeDueSoon': String(next.includeDueSoon),
        'reminders.repeatDays': String(next.repeatDays),
        'garage.name': name,
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  /** Un-archives a car and tells the shell, so the bay selector picks it up. */
  const restore = async (vehicle: VehicleSummary) => {
    setError(null);
    try {
      await api.updateVehicle(vehicle.id, { archived: false });
      await load();
      await onGarageChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const sendTest = async () => {
    setTestResult(null);
    setError(null);
    try {
      const result = await api.testReminder();
      setTestResult(
        result.sent
          ? 'Sent. Check the device your notify service points at.'
          : result.items === 0
            ? 'Nothing is due, so there was nothing to send.'
            : 'Could not send — see the note above.',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  if (error && !report) return <ErrorNote message={error} />;
  if (!report || !draft) return <Empty>Loading settings…</Empty>;

  const status = explain(report);

  return (
    <>
      {error && <ErrorNote message={error} />}

      <SectionRule icon={<BellRing size={18} />}>Reminders</SectionRule>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card title="When to tell me" icon={<Clock size={16} />} tone="petrol">
          <Toggle
            label="Send reminders"
            checked={draft.enabled}
            onChange={(v) => void save({ enabled: v })}
            hint="Off by default. Nothing is sent until you switch this on."
          />

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Check at" hint="Local time, from Home Assistant's timezone">
              <select
                className="gr-input"
                value={draft.hour}
                onChange={(e) => void save({ hour: Number(e.target.value) })}
              >
                {HOURS.map((hour) => (
                  <option key={hour} value={hour}>
                    {hourLabel(hour)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Repeat after" hint="How long before something still outstanding is raised again">
              <select
                className="gr-input"
                value={draft.repeatDays}
                onChange={(e) => void save({ repeatDays: Number(e.target.value) })}
              >
                {[1, 3, 7, 14, 30].map((days) => (
                  <option key={days} value={days}>
                    {days === 1 ? 'Every day' : `${days} days`}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="mt-4">
            <Toggle
              label="Include things merely coming up"
              checked={draft.includeDueSoon}
              onChange={(v) => void save({ includeDueSoon: v })}
              hint="Off means only tell me once something is actually overdue."
            />
          </div>

          <div className="mt-4">
            <Field
              label="Warn about papers"
              hint="How far ahead registration and insurance renewals are mentioned"
            >
              <select
                className="gr-input"
                value={draft.leadDays}
                onChange={(e) => void save({ leadDays: Number(e.target.value) })}
              >
                {[7, 14, 30, 60, 90].map((days) => (
                  <option key={days} value={days}>
                    {days} days ahead
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Card>

        <Card title="What would be sent right now" icon={<Send size={16} />} tone="steel">
          <div
            className={`mb-4 flex items-start gap-2 rounded border px-3 py-2 font-type text-[12px] leading-snug ${
              status.tone === 'warn'
                ? 'border-bad/40 bg-bad/10 text-bad'
                : status.tone === 'ok'
                  ? 'border-ok/40 bg-ok/10 text-ok'
                  : 'border-ink-3/40 bg-ink/5 text-ink-2'
            }`}
          >
            {status.tone === 'ok' ? (
              <CheckCircle2 size={15} className="mt-[1px] shrink-0" />
            ) : (
              <AlertTriangle size={15} className="mt-[1px] shrink-0" />
            )}
            <span>{status.text}</span>
          </div>

          {report.digest ? (
            <div className="rounded border border-ink-3/40 bg-cream/70 p-3">
              <p className="mb-2 font-stencil text-[13px] uppercase tracking-[0.12em] text-ink">
                {report.digest.title}
              </p>
              <pre className="whitespace-pre-wrap font-type text-[12px] leading-relaxed text-ink-2">
                {report.digest.message}
              </pre>
            </div>
          ) : (
            <Empty>Nothing is due across the garage.</Empty>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" className="gr-btn-quiet" onClick={() => void sendTest()}>
              <Send size={15} /> Send one now
            </button>
            <Pill tone={report.homeAssistant ? 'ok' : 'warn'}>
              {report.homeAssistant ? 'Home Assistant connected' : 'No Home Assistant'}
            </Pill>
            <Pill tone={report.notifyConfigured ? 'ok' : 'bad'}>
              {report.notifyConfigured ? 'notify service set' : 'no notify service'}
            </Pill>
          </div>

          {testResult && (
            <p className="mt-3 font-type text-[12px] text-ink-2">{testResult}</p>
          )}
        </Card>
      </div>

      <SectionRule icon={<Archive size={18} />}>Archived vehicles</SectionRule>

      <Card tone="steel">
        {archived.length === 0 ? (
          <Empty>
            Nothing is archived. Archiving a car hides it from the bay selector without losing its
            history — useful for one that has been sold or is off the road.
          </Empty>
        ) : (
          <ul className="divide-y divide-ink-3/25">
            {archived.map((vehicle) => (
              <li key={vehicle.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="font-ui text-sm text-ink">
                  {vehicle.year} {vehicle.make} {vehicle.model}
                </span>
                {vehicle.plate && <Pill tone="petrol">{vehicle.plate}</Pill>}
                <span className="font-type text-[11px] text-ink-3">
                  {vehicle.odometer.toLocaleString()} mi
                </span>
                <button
                  type="button"
                  className="gr-btn-quiet ml-auto"
                  onClick={() => void restore(vehicle)}
                >
                  <ArchiveRestore size={15} /> Bring it back
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <SectionRule icon={<SettingsIcon size={18} />}>This garage</SectionRule>

      <Card tone="steel">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" hint="Used as the title of any reminder sent to your phone">
            <input
              className="gr-input"
              value={garageName}
              placeholder="The Garage"
              onChange={(e) => setGarageName(e.target.value)}
              onBlur={() => void save({}, garageName)}
            />
          </Field>
        </div>
        <p className="mt-4 font-type text-[12px] leading-relaxed text-ink-3">
          Everything else about your cars is edited on their own screens. The add-on’s own
          configuration holds only the few identifiers that depend on how this Home Assistant is
          named — the sensor prefix, the notify service, and the factory reset.
          {saving && <span className="ml-2 italic">Saving…</span>}
        </p>
      </Card>
    </>
  );
}

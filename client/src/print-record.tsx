/**
 * The printable service record.
 *
 * A document rather than a screen: for a car kept as original as possible, the
 * written history *is* a large part of what the car is worth, and the person
 * reading it is a buyer, an insurer or a show judge who has never seen this
 * app. So it drops the garage theme entirely — black on white, plain tables,
 * no textures — and states plainly where the figures came from.
 *
 * Rendered as an overlay rather than a route. The app has no router, and under
 * ingress a second URL would need the same <base href> handling for no gain.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';

import type { ComponentState, ServiceEntry } from '@grg/shared';

import { api } from './lib/api.ts';
import type { VehicleDetail } from './lib/api.ts';

const money = (value: number) =>
  value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/**
 * Distinguishes "nothing was spent" from "costs were not written down".
 *
 * On a document handed to a buyer those are very different claims, and
 * printing $0 against a history full of work asserts the wrong one.
 */
const spend = (value: number, entries: number): string => {
  if (value > 0) return money(value);
  return entries > 0 ? 'Not recorded' : '—';
};

const longDate = (iso: string | null): string => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="pr-section">
      <h2 className="pr-h2">{title}</h2>
      {children}
    </section>
  );
}

/** Where a component stands today, in words a stranger can read. */
function componentStanding(state: ComponentState): string {
  if (!state.tracked) return 'Replaced as needed';
  if (!state.known) return 'No service recorded';
  if (state.overdue) return 'Due now';
  const parts: string[] = [];
  if (state.milesLeft !== null) parts.push(`${state.milesLeft.toLocaleString()} mi`);
  if (state.monthsLeft !== null) parts.push(`${Math.round(state.monthsLeft)} mo`);
  return parts.length > 0 ? `${parts.join(' / ')} remaining` : '—';
}

function interval(state: ComponentState): string {
  const parts: string[] = [];
  if (state.intervalMiles > 0) parts.push(`${state.intervalMiles.toLocaleString()} mi`);
  if (state.intervalMonths > 0) parts.push(`${state.intervalMonths} mo`);
  return parts.length > 0 ? parts.join(' / ') : 'On condition';
}

export function PrintRecord({ detail, onClose }: { detail: VehicleDetail; onClose: () => void }) {
  const { vehicle, components, entries, modifications, totals, renewals } = detail;
  const [garageName, setGarageName] = useState('The Garage');

  useEffect(() => {
    void api
      .settings()
      .then((settings) => setGarageName(settings['garage.name'] || 'The Garage'))
      .catch(() => undefined);
  }, []);

  // Escape closes, matching every other dialog in the app.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // A maintenance record reads forwards. The app lists newest first, which is
  // right for "what did I just do" and wrong for a history someone is reading
  // from the beginning.
  const chronological: ServiceEntry[] = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const earliest = chronological[0]?.date ?? null;
  const latest = chronological[chronological.length - 1]?.date ?? null;

  const title = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  const generated = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return createPortal(
    <div className="pr-overlay">
      <div className="pr-toolbar print:hidden">
        <span className="font-stencil text-sm uppercase tracking-[0.16em] text-cream">
          Service record — {title}
        </span>
        <button type="button" className="gr-btn-primary" onClick={() => window.print()}>
          <Printer size={16} /> Print or save as PDF
        </button>
        <button type="button" className="gr-btn-quiet" onClick={onClose}>
          <X size={16} /> Close
        </button>
      </div>

      <article className="pr-page">
        <header className="pr-head">
          <div>
            <p className="pr-kicker">{garageName}</p>
            <h1 className="pr-h1">{title}</h1>
            <p className="pr-sub">
              {[vehicle.body, vehicle.plate && `Plate ${vehicle.plate}`, vehicle.vin && `VIN ${vehicle.vin}`]
                .filter(Boolean)
                .join(' · ') || 'Service and maintenance record'}
            </p>
          </div>
          {vehicle.photo && <img src={vehicle.photo} alt="" className="pr-photo" />}
        </header>

        <Section title="The vehicle">
          <table className="pr-facts">
            <tbody>
              <tr>
                <th>Odometer</th>
                <td>{vehicle.odometer.toLocaleString()} miles</td>
                <th>Services recorded</th>
                <td>{totals.count}</td>
              </tr>
              <tr>
                <th>Record covers</th>
                <td>
                  {earliest ? `${longDate(earliest)} — ${longDate(latest)}` : 'No entries yet'}
                </td>
                <th>Total spent</th>
                <td>{spend(totals.lifetimeCost, totals.count)}</td>
              </tr>
              <tr>
                <th>Registration</th>
                <td>
                  {renewals.registration.permanent
                    ? 'Permanent — no expiry'
                    : longDate(vehicle.registrationExpires)}
                </td>
                <th>Cost per mile</th>
                <td>
                  {totals.costPerMile === null || totals.costPerMile === 0
                    ? '—'
                    : money(totals.costPerMile)}
                </td>
              </tr>
              <tr>
                <th>Insurance</th>
                <td>
                  {[vehicle.insuranceCarrier, vehicle.agreedValue].filter(Boolean).join(' · ') ||
                    '—'}
                </td>
                <th>Renews</th>
                <td>{longDate(vehicle.insuranceRenews)}</td>
              </tr>
            </tbody>
          </table>
        </Section>

        <Section title="Service history">
          {chronological.length === 0 ? (
            <p className="pr-empty">No work has been recorded yet.</p>
          ) : (
            <table className="pr-table">
              <thead>
                <tr>
                  <th className="w-[7.5rem]">Date</th>
                  <th className="w-[5.5rem] text-right">Odometer</th>
                  <th>Work carried out</th>
                  <th>Parts</th>
                  <th className="w-[6.5rem] text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {chronological.map((entry) => (
                  <tr key={entry.id}>
                    <td>{longDate(entry.date)}</td>
                    <td className="text-right tabular-nums">
                      {entry.odometer ? entry.odometer.toLocaleString() : '—'}
                    </td>
                    <td>
                      {entry.task}
                      {entry.note && <span className="pr-note">{entry.note}</span>}
                    </td>
                    <td>{entry.parts || '—'}</td>
                    <td className="text-right tabular-nums">
                      {entry.cost ? money(entry.cost) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>
                    {totals.count} {totals.count === 1 ? 'entry' : 'entries'}
                  </td>
                  <td className="whitespace-nowrap text-right tabular-nums">
                    {spend(totals.lifetimeCost, totals.count)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </Section>

        <Section title="Serviceable items and intervals">
          {components.length === 0 ? (
            <p className="pr-empty">No components are being tracked.</p>
          ) : (
            <table className="pr-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Specification</th>
                  <th className="w-[7rem]">Interval</th>
                  <th className="w-[8rem]">Last done</th>
                  <th className="w-[9rem]">Standing</th>
                </tr>
              </thead>
              <tbody>
                {components.map((state) => (
                  <tr key={state.componentId}>
                    <td>
                      {state.name}
                      {state.qty > 1 && <span className="pr-note">×{state.qty}</span>}
                    </td>
                    <td>{state.spec || '—'}</td>
                    <td>{interval(state)}</td>
                    <td>
                      {state.lastDate ? longDate(state.lastDate) : '—'}
                      {state.lastOdometer !== null && (
                        <span className="pr-note">
                          {state.lastOdometer.toLocaleString()} mi
                        </span>
                      )}
                    </td>
                    <td>{componentStanding(state)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {modifications.length > 0 && (
          <Section title="Modifications from standard">
            <table className="pr-table">
              <thead>
                <tr>
                  <th>Change</th>
                  <th>Detail</th>
                  <th className="w-[7rem]">Status</th>
                  <th className="w-[8rem]">Reversible</th>
                </tr>
              </thead>
              <tbody>
                {modifications.map((mod) => (
                  <tr key={mod.id}>
                    <td>{mod.title}</td>
                    <td>{mod.detail || '—'}</td>
                    <td className="capitalize">{mod.status.replace(/_/g, ' ')}</td>
                    <td>{mod.reversible ? 'Yes — returnable to standard' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="pr-note-block">
              Anything not listed here is believed to be as the factory built it.
            </p>
          </Section>
        )}

        <footer className="pr-foot">
          Compiled from the owner's own records on {generated}. Figures are derived from the
          entries above and are only as complete as the entries themselves.
        </footer>
      </article>
    </div>,
    // Rendered outside #root on purpose: printing hides the application, and a
    // document nested inside it would be hidden along with it.
    document.body,
  );
}

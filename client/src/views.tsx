/**
 * The six screens.
 *
 * Every list here is "tap a row to edit, tap Add to create" — the editing is
 * part of the screen you are already on, which is the whole reason this is an
 * app rather than a dashboard.
 */
import {
  AlertOctagon, BatteryCharging, CalendarClock, Camera, CircleDot, Disc, Droplet, FileText,
  Filter, Gauge as GaugeIcon, Pencil, Plus, RefreshCw, ShieldCheck, Wrench, Zap,
} from 'lucide-react';
import type { ReactNode } from 'react';

import type { ComponentState, Modification, ServiceEntry, WishlistItem } from '@grg/shared';

import { Gauge } from './components/Gauge.tsx';
import { Card, Empty, Pill, SectionRule, miles, money } from './components/ui.tsx';
import type { VehicleDetail } from './lib/api.ts';

const CATEGORY_ICON: Record<string, ReactNode> = {
  fluid: <Droplet size={18} />,
  battery: <BatteryCharging size={18} />,
  tire: <CircleDot size={18} />,
  filter: <Filter size={18} />,
  belt: <RefreshCw size={18} />,
  ignition: <Zap size={18} />,
  brake: <Disc size={18} />,
  other: <Wrench size={18} />,
};

function statusPill(state: ComponentState) {
  if (!state.tracked) return <Pill tone="petrol">On failure</Pill>;
  if (!state.known) return <Pill tone="petrol">No history</Pill>;
  if (state.overdue) return <Pill tone="bad">Overdue</Pill>;
  if (state.dueSoon) return <Pill tone="warn">Due soon</Pill>;
  return <Pill tone="ok">OK</Pill>;
}

/** Explains *why* something is due, which a bare percentage never does. */
function remaining(state: ComponentState): string {
  if (!state.tracked) return 'Replaced on failure';
  if (!state.known) return 'Never recorded';
  if (state.governedBy === 'mileage') {
    return state.overdue
      ? `${((state.milesSince ?? 0) - state.intervalMiles).toLocaleString()} mi over`
      : `${(state.milesLeft ?? 0).toLocaleString()} mi left`;
  }
  return state.overdue
    ? `${Math.max((state.monthsSince ?? 0) - state.intervalMonths, 0).toFixed(1)} months over`
    : `${state.monthsLeft ?? 0} months left`;
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="gr-btn-primary" onClick={onClick}>
      <Plus size={16} /> {label}
    </button>
  );
}

function Row({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-start gap-3 border-b border-ink-3/25 px-4 py-3 text-left transition hover:bg-enamel/5"
    >
      {children}
      <Pencil
        size={14}
        className="mt-1 shrink-0 text-ink-3 opacity-0 transition group-hover:opacity-100"
      />
    </button>
  );
}

// ------------------------------------------------------------------ dashboard
export function Dashboard({
  detail,
  onEditVehicle,
  onSetOdometer,
  onLogService,
  onServiceComponent,
}: {
  detail: VehicleDetail;
  onEditVehicle: () => void;
  onSetOdometer: () => void;
  onLogService: () => void;
  onServiceComponent: (state: ComponentState) => void;
}) {
  const { vehicle, components, totals, renewals } = detail;
  const attention = components.filter((c) => c.overdue || c.dueSoon);
  const tracked = components.filter((c) => c.tracked).slice(0, 4);

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[1.85fr_1fr] lg:items-start">
        <Card
          title={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
          icon={<GaugeIcon size={20} className="text-brass-hi" />}
          right="LIVE STATUS"
          tone="petrol"
          bodyClass="p-0"
        >
          <div className="relative">
            {vehicle.photo ? (
              <img src={vehicle.photo} alt={`${vehicle.year} ${vehicle.make}`} className="block w-full" />
            ) : (
              <button
                type="button"
                onClick={onEditVehicle}
                className="flex w-full flex-col items-center gap-2 bg-black/40 py-14 text-ink-3 transition hover:bg-black/30"
              >
                <Camera size={30} />
                <span className="font-type text-xs">Add a photo of the car</span>
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-px bg-[#1d1a16] sm:grid-cols-4">
            {[
              ['Odometer', miles(vehicle.odometer)],
              ['Since service', totals.daysSinceService === null ? '—' : `${totals.daysSinceService} d`],
              ['Services', String(totals.count)],
              ['Lifetime', money(totals.lifetimeCost)],
            ].map(([label, value]) => (
              <div key={label} className="gr-face px-2 py-4 text-center">
                <div className="gr-data text-lg text-ink">{value}</div>
                <div className="mt-1 font-stencil text-[9px] uppercase tracking-[0.18em] text-ink-3">{label}</div>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid gap-6">
          <Card title="Quick entry" icon={<Zap size={20} className="text-brass-hi" />}>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" className="gr-btn-primary" onClick={onLogService}>
                <Wrench size={16} /> Log service
              </button>
              <button type="button" className="gr-btn-quiet" onClick={onSetOdometer}>
                <GaugeIcon size={16} /> Odometer
              </button>
              <button type="button" className="gr-btn-quiet col-span-2" onClick={onEditVehicle}>
                <Pencil size={16} /> Edit this vehicle
              </button>
            </div>
          </Card>

          <Card
            title="Needs attention"
            icon={<AlertOctagon size={20} className="text-brass-hi" />}
            right={`${attention.length} ITEM${attention.length === 1 ? '' : 'S'}`}
            bodyClass="p-0"
          >
            {attention.length === 0 ? (
              <Empty>Nothing outstanding.</Empty>
            ) : (
              attention.map((state) => (
                <Row key={state.componentId} onClick={() => onServiceComponent(state)}>
                  <span className={state.overdue ? 'text-bad' : 'text-warn'}>
                    {CATEGORY_ICON[state.category]}
                  </span>
                  <span className="flex-1">
                    <span className="block font-stencil text-sm uppercase tracking-wide">{state.name}</span>
                    <span className="gr-data block text-[11px] text-ink-2">{remaining(state)}</span>
                  </span>
                  {statusPill(state)}
                </Row>
              ))
            )}
          </Card>

          <Card title="Papers" icon={<ShieldCheck size={20} className="text-brass-hi" />} tone="steel">
            <dl className="space-y-2">
              <div className="flex items-center justify-between border-b border-dotted border-ink-3/40 pb-2">
                <dt className="font-stencil text-xs uppercase tracking-[0.14em] text-ink-2">Registration</dt>
                <dd className="gr-data text-sm">
                  {renewals.registration.permanent ? (
                    <Pill tone="ok">Permanent</Pill>
                  ) : renewals.registration.days === null ? (
                    '—'
                  ) : (
                    <Pill tone={renewals.registration.days < 0 ? 'bad' : renewals.registration.days < 60 ? 'warn' : 'ok'}>
                      {renewals.registration.days < 0
                        ? `${Math.abs(renewals.registration.days)} d overdue`
                        : `${renewals.registration.days} d`}
                    </Pill>
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="font-stencil text-xs uppercase tracking-[0.14em] text-ink-2">Insurance</dt>
                <dd className="gr-data text-sm">
                  {renewals.insurance.days === null ? (
                    <span className="text-ink-3">Not recorded</span>
                  ) : (
                    <Pill tone={renewals.insurance.days < 0 ? 'bad' : renewals.insurance.days < 60 ? 'warn' : 'ok'}>
                      {renewals.insurance.days} d
                    </Pill>
                  )}
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>

      {tracked.length > 0 && (
        <>
          <SectionRule icon={<GaugeIcon size={22} />}>Service interval gauges</SectionRule>
          <Card tone="steel" dash bodyClass="p-6">
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
              {tracked.map((state, index) => (
                <button key={state.componentId} type="button" onClick={() => onServiceComponent(state)}>
                  <Gauge state={state} index={index} />
                </button>
              ))}
            </div>
            <p className="mt-6 border-l-4 border-brass bg-black/30 px-4 py-3 font-type text-[11px] leading-relaxed text-[#cdbb9c]">
              <strong className="text-brass-hi">INTERVAL POLICY</strong> — a classic is time-driven as
              much as mileage-driven. Each gauge tracks both and shows whichever expires first.
              Tap one to record a service.
            </p>
          </Card>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------- service log
export function ServiceLog({
  entries,
  totals,
  onAdd,
  onEdit,
}: {
  entries: ServiceEntry[];
  totals: VehicleDetail['totals'];
  onAdd: () => void;
  onEdit: (entry: ServiceEntry) => void;
}) {
  return (
    <>
      <div className="mb-5 grid gap-4 sm:grid-cols-4">
        {[
          ['Services logged', String(totals.count)],
          ['Lifetime', money(totals.lifetimeCost)],
          ['Last 12 months', money(totals.costTtm)],
          ['Cost per mile', totals.costPerMile === null ? '—' : money(totals.costPerMile)],
        ].map(([label, value]) => (
          <Card key={label} bodyClass="p-4">
            <div className="text-center">
              <div className="gr-data text-2xl text-ink">{value}</div>
              <div className="mt-1 font-stencil text-[10px] uppercase tracking-[0.18em] text-ink-2">{label}</div>
            </div>
          </Card>
        ))}
      </div>

      <Card
        title="Service ledger"
        icon={<Wrench size={20} className="text-brass-hi" />}
        right={<AddButton label="Log service" onClick={onAdd} />}
        bodyClass="p-0"
      >
        {entries.length === 0 ? (
          <Empty>No work logged yet. Tap “Log service” to start the history.</Empty>
        ) : (
          entries.map((entry) => (
            <Row key={entry.id} onClick={() => onEdit(entry)}>
              <span className="gr-data w-24 shrink-0 text-[12px] text-ink-2">{entry.date}</span>
              <span className="gr-data hidden w-20 shrink-0 text-[12px] text-ink-2 sm:block">
                {entry.odometer.toLocaleString()}
              </span>
              <span className="flex-1">
                <span className="block text-sm">{entry.task}</span>
                {entry.parts && <span className="block font-type text-[11px] text-ink-3">{entry.parts}</span>}
              </span>
              <span className="gr-data w-20 shrink-0 text-right text-sm font-bold">
                {money(entry.cost)}
              </span>
            </Row>
          ))
        )}
      </Card>
    </>
  );
}

// ----------------------------------------------------------------- components
export function Components({
  components,
  onAdd,
  onEdit,
  onService,
}: {
  components: ComponentState[];
  onAdd: () => void;
  onEdit: (state: ComponentState) => void;
  onService: (state: ComponentState) => void;
}) {
  return (
    <Card
      title="Components & fluids"
      icon={<Droplet size={20} className="text-brass-hi" />}
      right={<AddButton label="Add component" onClick={onAdd} />}
      bodyClass="p-0"
    >
      {components.length === 0 ? (
        <Empty>Nothing tracked yet.</Empty>
      ) : (
        components.map((state) => {
          const pct = state.usedPct ?? 0;
          const colour = state.overdue ? 'bg-bad' : state.dueSoon ? 'bg-warn' : 'bg-ok';
          return (
            <div key={state.componentId} className="border-b border-ink-3/25 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-enamel">{CATEGORY_ICON[state.category]}</span>
                <button type="button" onClick={() => onEdit(state)} className="group flex-1 text-left">
                  <span className="flex items-center gap-2">
                    <span className="font-stencil text-sm uppercase tracking-wide">{state.name}</span>
                    {state.qty > 1 && <span className="gr-data text-[11px] text-ink-3">×{state.qty}</span>}
                    <Pencil size={13} className="text-ink-3 opacity-0 transition group-hover:opacity-100" />
                  </span>
                  {state.spec && <span className="block font-type text-[11px] text-ink-3">{state.spec}</span>}
                </button>
                {statusPill(state)}
                <button type="button" className="gr-btn-quiet px-3 py-1 text-[11px]" onClick={() => onService(state)}>
                  Service
                </button>
              </div>

              {state.tracked && (
                <>
                  <div className="mt-2 h-3 overflow-hidden rounded-sm border border-ink-3/40 bg-ink/15">
                    <div className={`h-full ${colour}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <div className="mt-1 flex justify-between font-type text-[10px] text-ink-3">
                    <span>
                      {state.intervalMiles > 0 && `${state.intervalMiles.toLocaleString()} mi`}
                      {state.intervalMiles > 0 && state.intervalMonths > 0 && ' / '}
                      {state.intervalMonths > 0 && `${state.intervalMonths} mo`}
                      {state.governedBy && ` — ${state.governedBy} governs`}
                    </span>
                    <span className={state.overdue ? 'text-bad' : state.dueSoon ? 'text-warn' : ''}>
                      {remaining(state)}
                    </span>
                  </div>
                </>
              )}
            </div>
          );
        })
      )}
    </Card>
  );
}

// -------------------------------------------------------------------- wishlist
const PRIORITY_LABEL = { crucial: 'Crucial safety', mechanical: 'Mechanical', cosmetic: 'Cosmetic' } as const;

export function Wishlist({
  items,
  summary,
  onAdd,
  onEdit,
}: {
  items: WishlistItem[];
  summary: VehicleDetail['wishlistSummary'];
  onAdd: () => void;
  onEdit: (item: WishlistItem) => void;
}) {
  return (
    <>
      <div className="mb-5 flex justify-end">
        <AddButton label="Add project" onClick={onAdd} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        {(['crucial', 'mechanical', 'cosmetic'] as const).map((priority) => {
          const group = items.filter((i) => i.priority === priority);
          return (
            <Card
              key={priority}
              title={PRIORITY_LABEL[priority]}
              tone={priority === 'crucial' ? 'enamel' : priority === 'mechanical' ? 'steel' : 'petrol'}
              right={money(summary.byPriority[priority])}
              bodyClass="p-0"
            >
              {group.length === 0 ? (
                <Empty>Nothing here.</Empty>
              ) : (
                group.map((item) => (
                  <Row key={item.id} onClick={() => onEdit(item)}>
                    <span className="flex-1">
                      <span className={`block text-sm ${item.done ? 'text-ink-3 line-through' : ''}`}>
                        {item.title}
                      </span>
                      {item.detail && (
                        <span className="block font-type text-[11px] leading-relaxed text-ink-3">{item.detail}</span>
                      )}
                    </span>
                    <span className="gr-data shrink-0 text-sm text-enamel">{money(item.estimate)}</span>
                  </Row>
                ))
              )}
            </Card>
          );
        })}
      </div>
      <Card title="Budget outlook" tone="steel" bodyClass="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span className="font-stencil text-sm uppercase tracking-[0.16em] text-ink-2">
            {summary.open} open {summary.open === 1 ? 'project' : 'projects'}
          </span>
          <span className="gr-data text-xl text-enamel">{money(summary.totalEstimate)}</span>
        </div>
      </Card>
    </>
  );
}

// -------------------------------------------------------------------- upgrades
const MOD_TONE = { installed: 'ok', in_progress: 'warn', planned: 'petrol', removed: 'bad' } as const;

export function Upgrades({
  mods,
  onAdd,
  onEdit,
}: {
  mods: Modification[];
  onAdd: () => void;
  onEdit: (mod: Modification) => void;
}) {
  return (
    <Card
      title="Upgrades & modifications"
      icon={<RefreshCw size={20} className="text-brass-hi" />}
      right={<AddButton label="Add modification" onClick={onAdd} />}
      bodyClass="p-5"
    >
      {mods.length === 0 ? (
        <Empty>No modifications recorded. A stock car is a fine thing.</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {mods.map((mod) => (
            <button
              key={mod.id}
              type="button"
              onClick={() => onEdit(mod)}
              className="group rounded border border-ink-3/30 border-t-4 bg-white/30 p-4 text-left transition hover:bg-white/50"
              style={{
                borderTopColor:
                  mod.status === 'installed' ? '#3f6b36' : mod.status === 'in_progress' ? '#b9771f' : '#1a505a',
              }}
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="font-stencil text-sm uppercase tracking-wide">{mod.title}</span>
                <Pencil size={13} className="text-ink-3 opacity-0 transition group-hover:opacity-100" />
              </div>
              {mod.detail && (
                <p className="mb-3 font-type text-[11px] leading-relaxed text-ink-2">{mod.detail}</p>
              )}
              <div className="flex items-center justify-between">
                <Pill tone={MOD_TONE[mod.status]}>{mod.status.replace('_', ' ')}</Pill>
                <span className="gr-data text-[11px] text-ink-3">
                  {mod.date} · {money(mod.cost)}
                  {!mod.reversible && ' · permanent'}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------- papers
export function Papers({ detail, onEdit }: { detail: VehicleDetail; onEdit: () => void }) {
  const { vehicle, renewals } = detail;
  const rows: [string, ReactNode][] = [
    ['Plate', vehicle.plate || '—'],
    ['Legend', `${vehicle.plateLegendTop} / ${vehicle.plateLegendBottom}`],
    ['VIN / serial', vehicle.vin || '—'],
    ['Body', vehicle.body || '—'],
    [
      'Registration',
      renewals.registration.permanent
        ? 'Permanent — undated'
        : (vehicle.registrationExpires ?? 'Not recorded'),
    ],
    ['Insurance carrier', vehicle.insuranceCarrier || '—'],
    ['Insurance renews', vehicle.insuranceRenews ?? 'Not recorded'],
    ['Agreed value', vehicle.agreedValue || '—'],
  ];

  return (
    <Card
      title="Papers"
      icon={<FileText size={20} className="text-brass-hi" />}
      right={
        <button type="button" className="gr-btn-quiet px-3 py-1 text-[11px]" onClick={onEdit}>
          <Pencil size={13} /> Edit
        </button>
      }
      bodyClass="p-5"
    >
      <dl className="divide-y divide-dotted divide-ink-3/40">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between py-3">
            <dt className="font-stencil text-xs uppercase tracking-[0.14em] text-ink-2">{label}</dt>
            <dd className="gr-data text-sm">{value}</dd>
          </div>
        ))}
      </dl>
      {renewals.registration.permanent && (
        <p className="mt-4 flex items-start gap-2 border-l-4 border-brass bg-ink/5 px-4 py-3 font-type text-[11px] leading-relaxed text-ink-2">
          <CalendarClock size={16} className="mt-px shrink-0 text-brass-lo" />
          A Wisconsin Collector plate is permanent and undated, so nothing counts down here. Turn
          the toggle off in Edit if this car is on a dated plate.
        </p>
      )}
    </Card>
  );
}

/**
 * App shell: loads a vehicle, routes between the six screens, owns the dialogs.
 *
 * State is deliberately plain: fetch the whole vehicle in one request, mutate
 * through the API, then refetch. The payloads are a few kilobytes and every
 * derived figure is computed server-side from the same domain code the tests
 * cover, so a local cache would only be a second version of the truth.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ClipboardList, Droplet, FileText, Gauge as GaugeIcon, RefreshCw, Wrench,
} from 'lucide-react';
import type { ReactNode } from 'react';

import type { ComponentState, Modification, ServiceEntry, WishlistItem } from '@grg/shared';

import { NeonSign } from './components/NeonSign.tsx';
import { PlateBar } from './components/PlateBar.tsx';
import {
  ComponentDialog, EntryDialog, ModDialog, OdometerDialog, ServiceDialog, VehicleDialog,
  WishlistDialog,
} from './components/dialogs.tsx';
import { ErrorNote } from './components/ui.tsx';
import { api } from './lib/api.ts';
import type { VehicleDetail, VehicleSummary } from './lib/api.ts';
import { Components, Dashboard, Papers, ServiceLog, Upgrades, Wishlist } from './views.tsx';

const TABS = [
  ['dash', 'Dashboard', <GaugeIcon key="a" size={17} />],
  ['log', 'Service log', <Wrench key="b" size={17} />],
  ['components', 'Fluids & parts', <Droplet key="c" size={17} />],
  ['wishlist', 'Wishlist', <ClipboardList key="d" size={17} />],
  ['upgrades', 'Upgrades', <RefreshCw key="e" size={17} />],
  ['papers', 'Papers', <FileText key="f" size={17} />],
] as const;

type TabId = (typeof TABS)[number][0];

/** Which dialog is open, and the record it is editing. */
type DialogState =
  | { kind: 'none' }
  | { kind: 'vehicle'; record: VehicleDetail['vehicle'] | null }
  | { kind: 'odometer' }
  | { kind: 'entry'; record: ServiceEntry | null }
  | { kind: 'component'; record: ComponentState | null }
  | { kind: 'service'; record: ComponentState }
  | { kind: 'wishlist'; record: WishlistItem | null }
  | { kind: 'mod'; record: Modification | null };

export default function App() {
  const [vehicles, setVehicles] = useState<VehicleSummary[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [detail, setDetail] = useState<VehicleDetail | null>(null);
  const [tab, setTab] = useState<TabId>('dash');
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadVehicles = useCallback(async (selectId?: number) => {
    const list = await api.vehicles();
    setVehicles(list);
    setActiveId((current) => selectId ?? current ?? list[0]?.id ?? null);
    return list;
  }, []);

  const refresh = useCallback(async () => {
    if (activeId === null) {
      setDetail(null);
      return;
    }
    setDetail(await api.vehicle(activeId));
  }, [activeId]);

  useEffect(() => {
    void (async () => {
      try {
        await loadVehicles();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setLoading(false);
      }
    })();
  }, [loadVehicles]);

  useEffect(() => {
    void refresh().catch((cause: unknown) =>
      setError(cause instanceof Error ? cause.message : String(cause)),
    );
  }, [refresh]);

  /** Every mutation funnels through here so the screen can never drift. */
  const commit = useCallback(
    async (action: () => Promise<unknown>) => {
      await action();
      setDialog({ kind: 'none' });
      await Promise.all([loadVehicles(), refresh()]);
    },
    [loadVehicles, refresh],
  );

  const close = () => setDialog({ kind: 'none' });

  if (loading) {
    return <Shell><p className="py-20 text-center font-type text-cream/70">Opening the garage…</p></Shell>;
  }

  return (
    <Shell>
      <PlateBar
        vehicles={vehicles}
        activeId={activeId}
        onSelect={(id) => {
          setActiveId(id);
          setTab('dash');
        }}
        onAdd={() => setDialog({ kind: 'vehicle', record: null })}
      />

      {vehicles.length > 0 && (
        <nav className="sticky top-0 z-30 mt-5 bg-grease/90 backdrop-blur">
          <div className="mx-auto flex max-w-[1460px] flex-wrap gap-1 px-6 pt-3">
            {TABS.map(([id, label, icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex items-center gap-2 rounded-t border border-b-0 border-black px-5 py-3 font-stencil text-sm uppercase tracking-[0.16em] transition ${
                  tab === id ? 'text-white' : 'text-[#cfd6dc] hover:text-white'
                }`}
                style={{
                  backgroundImage:
                    tab === id
                      ? "linear-gradient(180deg, rgba(255,255,255,.34), rgba(255,255,255,.04) 42%, rgba(0,0,0,.34)), url('/textures/tex-enamel-red.jpg')"
                      : "linear-gradient(180deg, rgba(255,255,255,.32), rgba(0,0,0,.26) 50%, rgba(0,0,0,.6)), url('/textures/tex-steel-dark.jpg')",
                  backgroundSize: 'auto, 240px 240px',
                }}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
        </nav>
      )}

      <main className="mx-auto max-w-[1460px] px-6 pb-20 pt-6">
        {error && <ErrorNote message={error} />}

        {vehicles.length === 0 ? (
          <div className="py-24 text-center">
            <p className="mb-5 font-type text-cream/70">
              The garage is empty. Register your first car to begin its history.
            </p>
            <button
              type="button"
              className="gr-btn-primary"
              onClick={() => setDialog({ kind: 'vehicle', record: null })}
            >
              Add a vehicle
            </button>
          </div>
        ) : (
          detail && (
            <>
              {tab === 'dash' && (
                <Dashboard
                  detail={detail}
                  onEditVehicle={() => setDialog({ kind: 'vehicle', record: detail.vehicle })}
                  onSetOdometer={() => setDialog({ kind: 'odometer' })}
                  onLogService={() => setDialog({ kind: 'entry', record: null })}
                  onServiceComponent={(record) => setDialog({ kind: 'service', record })}
                />
              )}
              {tab === 'log' && (
                <ServiceLog
                  entries={detail.entries}
                  totals={detail.totals}
                  onAdd={() => setDialog({ kind: 'entry', record: null })}
                  onEdit={(record) => setDialog({ kind: 'entry', record })}
                />
              )}
              {tab === 'components' && (
                <Components
                  components={detail.components}
                  onAdd={() => setDialog({ kind: 'component', record: null })}
                  onEdit={(record) => setDialog({ kind: 'component', record })}
                  onService={(record) => setDialog({ kind: 'service', record })}
                />
              )}
              {tab === 'wishlist' && (
                <Wishlist
                  items={detail.wishlist}
                  summary={detail.wishlistSummary}
                  onAdd={() => setDialog({ kind: 'wishlist', record: null })}
                  onEdit={(record) => setDialog({ kind: 'wishlist', record })}
                />
              )}
              {tab === 'upgrades' && (
                <Upgrades
                  mods={detail.modifications}
                  onAdd={() => setDialog({ kind: 'mod', record: null })}
                  onEdit={(record) => setDialog({ kind: 'mod', record })}
                />
              )}
              {tab === 'papers' && (
                <Papers detail={detail} onEdit={() => setDialog({ kind: 'vehicle', record: detail.vehicle })} />
              )}
            </>
          )
        )}
      </main>

      {/* ------------------------------------------------------- dialogs */}
      {dialog.kind === 'vehicle' && (
        <VehicleDialog
          open
          initial={dialog.record}
          onClose={close}
          onSave={(values) =>
            commit(async () => {
              if (dialog.record) {
                await api.updateVehicle(dialog.record.id, values);
              } else {
                const created = await api.createVehicle(values);
                setActiveId(created.id);
              }
            })
          }
          onDelete={
            dialog.record
              ? () =>
                  commit(async () => {
                    await api.deleteVehicle(dialog.record!.id);
                    setActiveId(null);
                    setDetail(null);
                  })
              : undefined
          }
        />
      )}

      {dialog.kind === 'odometer' && detail && (
        <OdometerDialog
          open
          current={detail.vehicle.odometer}
          onClose={close}
          onSave={(value) => commit(() => api.setOdometer(detail.vehicle.id, value))}
        />
      )}

      {dialog.kind === 'entry' && detail && (
        <EntryDialog
          open
          initial={dialog.record}
          onClose={close}
          onSave={(values) =>
            commit(() =>
              dialog.record
                ? api.updateEntry(dialog.record.id, values)
                : api.createEntry(detail.vehicle.id, values),
            )
          }
          onDelete={dialog.record ? () => commit(() => api.deleteEntry(dialog.record!.id)) : undefined}
        />
      )}

      {dialog.kind === 'component' && detail && (
        <ComponentDialog
          open
          initial={dialog.record}
          onClose={close}
          onSave={(values) =>
            commit(() =>
              dialog.record
                ? api.updateComponent(dialog.record.componentId, values)
                : api.createComponent(detail.vehicle.id, values),
            )
          }
          onDelete={
            dialog.record
              ? () => commit(() => api.deleteComponent(dialog.record!.componentId))
              : undefined
          }
        />
      )}

      {dialog.kind === 'service' && (
        <ServiceDialog
          open
          name={dialog.record.name}
          onClose={close}
          onSave={(values) => commit(() => api.serviceComponent(dialog.record.componentId, values))}
        />
      )}

      {dialog.kind === 'wishlist' && detail && (
        <WishlistDialog
          open
          initial={dialog.record}
          onClose={close}
          onSave={(values) =>
            commit(() =>
              dialog.record
                ? api.updateWishlist(dialog.record.id, values)
                : api.createWishlist(detail.vehicle.id, values),
            )
          }
          onDelete={dialog.record ? () => commit(() => api.deleteWishlist(dialog.record!.id)) : undefined}
        />
      )}

      {dialog.kind === 'mod' && detail && (
        <ModDialog
          open
          initial={dialog.record}
          onClose={close}
          onSave={(values) =>
            commit(() =>
              dialog.record
                ? api.updateMod(dialog.record.id, values)
                : api.createMod(detail.vehicle.id, values),
            )
          }
          onDelete={dialog.record ? () => commit(() => api.deleteMod(dialog.record!.id)) : undefined}
        />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full">
      <header className="mx-auto flex max-w-[1460px] items-center gap-6 px-6 pt-7">
        <NeonSign />
      </header>
      <div className="gr-checker mt-6" />
      {children}
      <footer className="mt-10 border-t-2 border-chrome-4 py-6 text-center font-stencil text-xs uppercase tracking-[0.22em] text-[#7a6450]">
        The Garage Register
      </footer>
    </div>
  );
}

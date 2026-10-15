/**
 * Bay selector — one Wisconsin Collector plate per vehicle.
 *
 * Colours and legends are sampled from a real plate; the field is a muted
 * slate blue and the characters are raised red metal, not flat text.
 */
import { Plus } from 'lucide-react';
import type { VehicleSummary } from '../lib/api.ts';

function Screws() {
  const base =
    'absolute h-[9px] w-[9px] rounded-full z-10 ' +
    "after:content-[''] after:absolute after:left-[1.5px] after:right-[1.5px] after:top-[4px] " +
    'after:h-[1.4px] after:rounded-[1px] after:bg-[rgba(30,34,38,.75)]';
  const dot = {
    background: 'radial-gradient(circle at 34% 30%,#fff 0%,#c2c9d0 42%,#737b83 74%,#434a51 100%)',
    boxShadow: '0 1px 2px rgba(0,0,0,.8), inset 0 -1px 1px rgba(0,0,0,.45)',
  };
  return (
    <>
      <span className={`${base} left-[8px] top-[8px]`} style={dot} />
      <span className={`${base} right-[8px] top-[8px]`} style={dot} />
      <span className={`${base} bottom-[8px] left-[8px]`} style={dot} />
      <span className={`${base} bottom-[8px] right-[8px]`} style={dot} />
    </>
  );
}

export function PlateBar({
  vehicles,
  activeId,
  onSelect,
  onAdd,
}: {
  vehicles: VehicleSummary[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onAdd: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-[1460px] flex-wrap items-stretch gap-4 px-6 pt-5">
      <span className="self-center whitespace-nowrap pr-1 font-stencil text-xs uppercase tracking-[0.22em] text-brass">
        Select Bay
      </span>

      {vehicles.map((vehicle) => {
        const active = vehicle.id === activeId;
        const lamp = vehicle.overdueCount > 0 ? 'bg-[#ff5542]' : vehicle.dueSoonCount > 0 ? 'bg-[#ffbe4d]' : 'bg-[#4a1a16]';
        const glow =
          vehicle.overdueCount > 0
            ? '0 0 10px #ff5542, 0 0 20px rgba(255,85,66,.6)'
            : vehicle.dueSoonCount > 0
              ? '0 0 10px #ffbe4d'
              : 'none';
        return (
          <button
            key={vehicle.id}
            type="button"
            onClick={() => onSelect(vehicle.id)}
            className="group relative text-left"
            aria-pressed={active}
          >
            {/* The lamp is the fleet-level warning: red overdue, amber soon. */}
            <span
              className={`absolute -right-[5px] -top-[5px] z-20 h-[11px] w-[11px] rounded-full border border-[#16100e] ${lamp}`}
              style={{ boxShadow: glow }}
              aria-hidden
            />
            <span
              className="gr-plate-frame block group-hover:-translate-y-0.5"
              style={
                active
                  ? {
                      boxShadow:
                        '0 0 0 2px #8a6417, 0 0 28px rgba(217,164,65,.6), 0 10px 22px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.9)',
                    }
                  : undefined
              }
            >
              <Screws />
              <span className="gr-plate w-[212px]">
                <span className="gr-emboss block text-center font-stencil text-[12px] uppercase tracking-[0.38em]">
                  {vehicle.plateLegendTop || 'COLLECTOR'}
                </span>
                <span className="gr-emboss block text-center font-stencil text-[38px] leading-none tracking-[0.08em]">
                  {vehicle.plate || '—'}
                </span>
                <span className="gr-emboss block text-center font-stencil text-[12px] uppercase tracking-[0.38em]">
                  {vehicle.plateLegendBottom || 'WISCONSIN'}
                </span>
              </span>
            </span>
            <span
              className={`mt-[7px] block text-center font-type text-[9.5px] tracking-wide drop-shadow-[0_1px_2px_rgba(0,0,0,.9)] ${
                active ? 'text-brass-hi' : 'text-[#c2ad8d]'
              }`}
            >
              {vehicle.year} {vehicle.make} {vehicle.model}
            </span>
          </button>
        );
      })}

      <button type="button" onClick={onAdd} className="group text-left">
        <span
          className="gr-plate-frame block group-hover:-translate-y-0.5"
          style={{ background: 'linear-gradient(142deg,#4a4038,#2a231d)' }}
        >
          <span
            className="gr-plate flex w-[150px] flex-col items-center justify-center border-2 border-dashed border-[#6b5745] py-2"
            style={{ backgroundColor: 'transparent', backgroundImage: "url('/textures/tex-crinkle.jpg')", backgroundSize: '250px 250px' }}
          >
            <Plus size={22} className="text-[#b39d7e]" />
            <span className="mt-1 font-stencil text-[13px] uppercase tracking-[0.2em] text-[#b39d7e]">
              Add vehicle
            </span>
          </span>
        </span>
        <span className="mt-[7px] block text-center font-type text-[9.5px] tracking-wide text-[#8a7458]">
          register a car
        </span>
      </button>
    </div>
  );
}

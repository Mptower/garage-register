/**
 * Service-interval gauge: engine-turned dial, chrome bezel, brass needle.
 *
 * The needle shows the clamped value so it never swings past full, but the
 * caption reports what is actually driving it — "3,202 mi over" is useful in a
 * way that a pegged needle is not.
 */
import type { ComponentState } from '@grg/shared';

const START = -212;
const END = 32;

function polar(radius: number, degrees: number) {
  const rad = (degrees * Math.PI) / 180;
  return [90 + radius * Math.cos(rad), 92 + radius * Math.sin(rad)] as const;
}

function arc(radius: number, from: number, to: number) {
  const [x1, y1] = polar(radius, from);
  const [x2, y2] = polar(radius, to);
  return `M${x1} ${y1} A${radius} ${radius} 0 ${Math.abs(to - from) > 180 ? 1 : 0} 1 ${x2} ${y2}`;
}

export function Gauge({ state, index }: { state: ComponentState; index: number }) {
  const pct = (state.usedPct ?? 0) / 100;
  const angle = START + (END - START) * pct;
  const colour = state.overdue ? '#9e2a1e' : state.dueSoon ? '#b9771f' : '#3f6b36';

  const [nx, ny] = polar(46, angle);
  const [tx, ty] = polar(-9, angle);

  const ticks = Array.from({ length: 13 }, (_, k) => {
    const degrees = START + ((END - START) * k) / 12;
    const major = k % 3 === 0;
    const [xa, ya] = polar(major ? 44 : 48, degrees);
    const [xb, yb] = polar(54, degrees);
    return (
      <path
        key={k}
        d={`M${xa} ${ya} L${xb} ${yb}`}
        stroke="#4a3626"
        strokeWidth={major ? 2.2 : 1}
        opacity={major ? 0.85 : 0.5}
        strokeLinecap="round"
      />
    );
  });

  const headline = !state.known
    ? '—'
    : state.overdue
      ? 'OVERDUE'
      : state.governedBy === 'mileage'
        ? (state.milesLeft ?? 0).toLocaleString()
        : `${state.monthsLeft ?? 0} MO`;

  const caption = !state.known
    ? 'NO HISTORY'
    : state.overdue
      ? state.governedBy === 'mileage'
        ? `${((state.milesSince ?? 0) - state.intervalMiles).toLocaleString()} MI OVER`
        : `${Math.max((state.monthsSince ?? 0) - state.intervalMonths, 0).toFixed(1)} MO OVER`
      : state.governedBy === 'mileage'
        ? 'MI LEFT'
        : 'MONTHS LEFT';

  return (
    <div className="text-center">
      <svg viewBox="0 0 180 152" className="mx-auto h-auto w-full max-w-[170px]">
        <defs>
          <radialGradient id={`grDial${index}`} cx=".38" cy=".3" r=".85">
            <stop offset="0" stopColor="#fdf8ea" />
            <stop offset=".55" stopColor="#f1e6cd" />
            <stop offset="1" stopColor="#d6c4a2" />
          </radialGradient>
          <linearGradient id={`grBezel${index}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset=".2" stopColor="#d9e0e6" />
            <stop offset=".46" stopColor="#8c949c" />
            <stop offset=".58" stopColor="#4a5158" />
            <stop offset=".76" stopColor="#c3cad1" />
            <stop offset="1" stopColor="#767e86" />
          </linearGradient>
          <linearGradient id={`grDome${index}`} x1=".2" y1="0" x2=".8" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".5" />
            <stop offset=".42" stopColor="#fff" stopOpacity=".07" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <pattern id={`grGuil${index}`} width="9" height="9" patternUnits="userSpaceOnUse">
            <circle cx="4.5" cy="4.5" r="4" fill="none" stroke="#9c8352" strokeWidth=".45" opacity=".32" />
            <circle cx="4.5" cy="4.5" r="2" fill="none" stroke="#9c8352" strokeWidth=".35" opacity=".24" />
          </pattern>
          <clipPath id={`grFace${index}`}>
            <circle cx="90" cy="92" r="58" />
          </clipPath>
        </defs>

        <circle cx="90" cy="92" r="71" fill={`url(#grBezel${index})`} />
        <circle cx="90" cy="92" r="71" fill="none" stroke="#2f353b" strokeWidth="1.2" />
        <circle cx="90" cy="92" r="62" fill="#2b231a" />
        <circle cx="90" cy="92" r="58" fill={`url(#grDial${index})`} />
        <g clipPath={`url(#grFace${index})`}>
          <rect x="20" y="22" width="140" height="140" fill={`url(#grGuil${index})`} />
        </g>

        <path d={arc(54, START, END)} fill="none" stroke="rgba(36,26,18,.14)" strokeWidth="7" strokeLinecap="round" />
        {state.known && (
          <path d={arc(54, START, angle)} fill="none" stroke={colour} strokeWidth="7" strokeLinecap="round" opacity=".93" />
        )}
        <path d={arc(54, START + (END - START) * 0.86, END)} fill="none" stroke="#9e2a1e" strokeWidth="7" strokeLinecap="round" opacity=".45" />
        {ticks}

        <text x="90" y="74" fontFamily="Staatliches, sans-serif" fontSize="9" fill="#7a6540" textAnchor="middle" letterSpacing="2.4">
          SERVICE
        </text>
        <text x="90" y="116" fontFamily="Special Elite, monospace" fontSize="15" fill="#241a12" textAnchor="middle">
          {headline}
        </text>
        <text x="90" y="129" fontFamily="Special Elite, monospace" fontSize="7.5" fill="#8a7254" textAnchor="middle" letterSpacing="1.2">
          {caption}
        </text>

        {state.known && (
          <>
            <path d={`M${tx} ${ty} L${nx} ${ny}`} stroke="#1d1209" strokeWidth="4.4" strokeLinecap="round" opacity=".26" transform="translate(1.5,2)" />
            <path d={`M${tx} ${ty} L${nx} ${ny}`} stroke={colour} strokeWidth="3.2" strokeLinecap="round" />
          </>
        )}
        <circle cx="90" cy="92" r="8" fill={`url(#grBezel${index})`} stroke="#2f353b" strokeWidth="1" />
        <circle cx="90" cy="92" r="3" fill="#241a12" />
        <ellipse cx="72" cy="68" rx="40" ry="26" fill={`url(#grDome${index})`} transform="rotate(-28 72 68)" />
      </svg>
      <div className="mt-2 font-stencil text-[13px] uppercase tracking-[0.18em] text-brass-hi drop-shadow-[0_2px_3px_rgba(0,0,0,.9)]">
        {state.name}
      </div>
    </div>
  );
}

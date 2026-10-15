/**
 * The shop sign.
 *
 * Built from stacked SVG strokes rather than text-shadow so the glass casing,
 * the gas column and the white-hot core are all physically present: a tube has
 * a cross-section, and a glow alone reads as coloured text.
 */
const RED_LAYERS = [
  { fill: '#ff2a1c', stroke: '#ff2a1c', width: 16, opacity: 0.46, filter: 'grBloomXL', screen: true },
  { fill: '#ff5a46', stroke: '#ff5a46', width: 11, opacity: 0.68, filter: 'grBloomL', screen: true },
  { fill: 'none', stroke: '#2a0705', width: 13, opacity: 0.96 },
  { fill: 'none', stroke: '#7d1410', width: 10.5, opacity: 0.95 },
  { fill: '#ff4b38', stroke: '#ff4b38', width: 8.2, opacity: 1, filter: 'grBloomS' },
  { fill: '#ffd8c6', stroke: '#ffd8c6', width: 2 },
  { fill: 'none', stroke: '#fff6f0', width: 0.8, opacity: 0.4 },
];

const CYAN_LAYERS = [
  { fill: '#19c6ff', stroke: '#19c6ff', width: 9, opacity: 0.34, filter: 'grBloomL', screen: true },
  { fill: 'none', stroke: '#05202c', width: 8, opacity: 0.95 },
  { fill: 'none', stroke: '#0d5d7a', width: 6, opacity: 0.95 },
  { fill: '#39d8ff', stroke: '#39d8ff', width: 4.2, opacity: 1, filter: 'grBloomS' },
  { fill: '#eafaff', stroke: '#eafaff', width: 1.3 },
  { fill: 'none', stroke: '#ffffff', width: 0.6, opacity: 0.45 },
];

interface Layer {
  fill: string;
  stroke: string;
  width: number;
  opacity?: number;
  filter?: string;
  screen?: boolean;
}

function Tube({
  text,
  x,
  y,
  font,
  size,
  spacing,
  layers,
}: {
  text: string;
  x: number;
  y: number;
  font: string;
  size: number;
  spacing: number;
  layers: Layer[];
}) {
  return (
    <>
      {layers.map((layer, index) => (
        <text
          key={index}
          x={x}
          y={y}
          fontFamily={font}
          fontSize={size}
          letterSpacing={spacing}
          textAnchor="middle"
          fill={layer.fill}
          stroke={layer.stroke}
          strokeWidth={layer.width}
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={layer.opacity}
          filter={layer.filter ? `url(#${layer.filter})` : undefined}
          style={{
            paintOrder: 'stroke fill',
            mixBlendMode: layer.screen ? 'screen' : undefined,
          }}
        >
          {text}
        </text>
      ))}
    </>
  );
}

export function NeonSign({ subtitle = 'CLASSIC VEHICLE REGISTER' }: { subtitle?: string }) {
  return (
    <div
      className="relative flex-1 rounded-lg border-[3px] border-[#0b0908] px-6 py-4"
      style={{
        backgroundImage:
          'radial-gradient(60% 70% at 50% 44%, rgba(255,62,46,.26) 0%, transparent 70%),' +
          'radial-gradient(44% 52% at 50% 80%, rgba(32,190,240,.16) 0%, transparent 72%),' +
          'linear-gradient(180deg, rgba(255,255,255,.06), rgba(0,0,0,.55) 55%, rgba(0,0,0,.8)),' +
          "url('/textures/tex-crinkle.jpg')",
        backgroundSize: 'auto, auto, auto, 250px 250px',
        boxShadow: '0 22px 52px rgba(0,0,0,.88), inset 0 0 0 2px rgba(255,255,255,.06)',
      }}
    >
      <svg viewBox="0 0 820 200" className="mx-auto block h-auto w-full max-w-[660px] overflow-visible" role="img" aria-label="The Garage">
        <defs>
          <filter id="grBloomXL" x="-70%" y="-70%" width="240%" height="240%">
            <feGaussianBlur stdDeviation="26" />
          </filter>
          <filter id="grBloomL" x="-55%" y="-55%" width="210%" height="210%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
          <filter id="grBloomS" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="1.9" />
          </filter>
        </defs>
        <g className="gr-buzz">
          <Tube text="The Garage" x={410} y={92} font="Sacramento, cursive" size={96} spacing={1} layers={RED_LAYERS} />
          <Tube text={subtitle} x={410} y={150} font="Staatliches, sans-serif" size={23} spacing={7} layers={CYAN_LAYERS} />
          <g>
            <line x1={168} y1={174} x2={652} y2={174} stroke="#ffb347" strokeWidth={7} opacity={0.4} filter="url(#grBloomL)" strokeLinecap="round" style={{ mixBlendMode: 'screen' }} />
            <line x1={168} y1={174} x2={652} y2={174} stroke="#3a2208" strokeWidth={6.5} strokeLinecap="round" />
            <line x1={168} y1={174} x2={652} y2={174} stroke="#ffc063" strokeWidth={3.4} strokeLinecap="round" filter="url(#grBloomS)" />
            <line x1={168} y1={174} x2={652} y2={174} stroke="#fff4e0" strokeWidth={1.1} strokeLinecap="round" />
            <circle cx={168} cy={174} r={3.6} fill="#8d959c" />
            <circle cx={652} cy={174} r={3.6} fill="#8d959c" />
          </g>
        </g>
      </svg>
    </div>
  );
}

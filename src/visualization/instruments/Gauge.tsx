import { BAR } from '@/simulation/core/units';
import { usePrefs } from '@/stores/prefs';
import { formatQuantity } from '@/simulation/core/units';

/** Instrument-style analogue gauge (Bourdon tube dial) with digital readout. */
export function Gauge({ value, min, max, label, sub, warnAbove, size = 132, pegged, damaged }: { value: number; min: number; max: number; label: string; sub?: string; warnAbove?: number; size?: number; pegged?: boolean; damaged?: boolean }) {
  const units = usePrefs((s) => s.units);
  const span = 270;
  const start = -225;
  const frac = Math.max(0, Math.min(1.04, (value - min) / (max - min)));
  const a = ((start + frac * span) * Math.PI) / 180;
  const r = 52;
  const ticks = Array.from({ length: 11 }, (_, i) => i / 10);
  const warnFrac = warnAbove !== undefined ? (warnAbove - min) / (max - min) : null;
  const arc = (f0: number, f1: number) => {
    const a0 = ((start + f0 * span) * Math.PI) / 180;
    const a1 = ((start + f1 * span) * Math.PI) / 180;
    const large = (f1 - f0) * span > 180 ? 1 : 0;
    return `M${60 + r * Math.cos(a0)},${60 + r * Math.sin(a0)} A${r},${r} 0 ${large} 1 ${60 + r * Math.cos(a1)},${60 + r * Math.sin(a1)}`;
  };
  const scale = (f: number) => {
    const v = min + f * (max - min);
    return units === 'imperial' ? Math.round(v / 6894.757) : Math.round(v / BAR);
  };
  return (
    <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, width: size }}>
      <svg viewBox="0 0 120 112" width={size} height={size * 0.93} role="img" aria-label={`${label}: ${formatQuantity(value, 'pressure', units)}`}>
        <circle cx={60} cy={60} r={58} fill="#0c0e10" stroke="#3a4047" strokeWidth={2} />
        <circle cx={60} cy={60} r={55} fill="#15181b" />
        {warnFrac !== null && warnFrac < 1 && <path d={arc(Math.max(0, warnFrac), 1)} stroke="#e5534b" strokeWidth={5} fill="none" opacity={0.75} />}
        {ticks.map((t) => {
          const ta = ((start + t * span) * Math.PI) / 180;
          return (
            <g key={t}>
              <line x1={60 + 46 * Math.cos(ta)} y1={60 + 46 * Math.sin(ta)} x2={60 + 52 * Math.cos(ta)} y2={60 + 52 * Math.sin(ta)} stroke="#9aa3ad" strokeWidth={1.2} />
              {t * 10 % 2 === 0 && (
                <text x={60 + 37 * Math.cos(ta)} y={60 + 37 * Math.sin(ta) + 3} fontSize={7} fill="#8a939d" textAnchor="middle">
                  {scale(t)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={60} y1={60} x2={60 + 44 * Math.cos(a)} y2={60 + 44 * Math.sin(a)} stroke={damaged ? '#777' : '#f2a93b'} strokeWidth={2.2} strokeLinecap="round" style={{ transition: 'all 0.08s linear' }} />
        <circle cx={60} cy={60} r={4} fill="#2d3238" stroke="#9aa3ad" />
        <text x={60} y={86} fontSize={7} fill="#8a939d" textAnchor="middle">
          {units === 'imperial' ? 'psi' : 'bar'}
        </text>
        <text x={60} y={100} fontSize={11} fill={pegged ? '#e5534b' : '#e5e8eb'} textAnchor="middle" fontFamily="ui-monospace, monospace">
          {damaged ? 'DAMAGED' : formatQuantity(value, 'pressure', units, units === 'imperial' ? 0 : 1).replace(/ (bar|psi)/, '')}
        </text>
      </svg>
      <figcaption style={{ fontSize: 11.5, color: 'var(--text-2)', textAlign: 'center', lineHeight: 1.2 }}>
        {label}
        {sub && <div style={{ color: 'var(--muted)', fontSize: 10.5 }}>{sub}</div>}
      </figcaption>
    </figure>
  );
}

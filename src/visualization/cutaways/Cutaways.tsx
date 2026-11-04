import { useEffect, useRef, useState } from 'react';

/** Accumulates a rotation angle (deg) for a given speed (rpm), slowed for visibility. */
function useSpin(rpm: number, slow = 12) {
  const [a, setA] = useState(0);
  const ref = useRef(rpm);
  ref.current = rpm;
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;
      setA((x) => (x + (ref.current / 60) * 360 * dt / slow) % 360);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [slow]);
  return a;
}

const C = { body: '#2b3036', edge: '#59626c', metal: '#9aa3ad', oilP: '#e5534b', oilT: '#4a90d9', oilS: '#3fc1a5', oilW: '#d77ad3', bubble: '#e3e8ee' };

function gearPath(cx: number, cy: number, r: number, teeth: number) {
  const pts: string[] = [];
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 ? r : r * 0.82;
    pts.push(`${cx + rr * Math.cos(a)},${cy + rr * Math.sin(a)}`);
  }
  return `M${pts.join('L')}Z`;
}

export function GearPumpCutaway({ rpm, cavitating = false, label = true }: { rpm: number; cavitating?: boolean; label?: boolean }) {
  const a = useSpin(rpm);
  return (
    <svg viewBox="0 0 240 160" width="100%" role="img" aria-label={`Gear pump cutaway, ${Math.round(rpm)} rpm`}>
      <rect x={30} y={20} width={180} height={120} rx={30} fill={C.body} stroke={C.edge} />
      <rect x={0} y={68} width={34} height={24} fill={C.oilS} opacity={0.7} />
      <rect x={206} y={68} width={34} height={24} fill={C.oilP} opacity={0.75} />
      <rect x={34} y={30} width={172} height={100} rx={24} fill="#1a1d21" />
      <path d={gearPath(92, 80, 44, 10)} fill={C.metal} stroke="#6c7680" transform={`rotate(${a} 92 80)`} />
      <path d={gearPath(148, 80, 44, 10)} fill="#b4bcc4" stroke="#6c7680" transform={`rotate(${-a + 18} 148 80)`} />
      <circle cx={92} cy={80} r={7} fill="#2d3238" />
      <circle cx={148} cy={80} r={7} fill="#2d3238" />
      {cavitating && Array.from({ length: 8 }, (_, i) => <circle key={i} cx={50 + ((i * 23 + a) % 50)} cy={70 + (i % 4) * 6} r={2 + (i % 3)} fill={C.bubble} opacity={0.7} />)}
      {label && (
        <>
          <text x={4} y={62} fontSize={9} fill={C.oilS}>INLET</text>
          <text x={200} y={62} fontSize={9} fill={C.oilP}>OUTLET</text>
          <text x={120} y={154} fontSize={9} fill="#8a939d" textAnchor="middle">Oil carried around the OUTSIDE of the gears, between teeth and housing</text>
        </>
      )}
    </svg>
  );
}

export function SpoolValveCutaway({ spool, four = false }: { spool: number; four?: boolean }) {
  // Body with ports T A P B T (4-way) or T A P (3-way); spool lands shift with position.
  const shift = spool * 26;
  const ports = four ? ['T', 'A', 'P', 'B', 'T'] : ['T', 'A', 'P', 'T'];
  const xs = ports.map((_, i) => 40 + i * (four ? 40 : 50));
  const connected = (p: string, i: number): string | null => {
    // which ports are linked through the spool grooves
    const s = spool;
    if (Math.abs(s) < 0.3) return p === 'P' ? (four ? null : C.oilT) : null;
    if (s > 0) {
      if (p === 'P' || p === 'A') return C.oilP;
      if (four && p === 'B') return C.oilT;
      if (four && p === 'T' && i === 4) return C.oilT;
    } else {
      if (four && (p === 'P' || p === 'B')) return C.oilP;
      if (p === 'A') return C.oilW;
      if (p === 'T' && i === 0) return C.oilT;
      if (!four && p === 'P') return C.oilP;
    }
    return null;
  };
  return (
    <svg viewBox="0 0 240 130" width="100%" role="img" aria-label={`Spool valve cutaway, spool ${spool.toFixed(2)}`}>
      <rect x={10} y={40} width={220} height={50} fill={C.body} stroke={C.edge} />
      {ports.map((p, i) => (
        <g key={i}>
          <rect x={xs[i]! - 8} y={p === 'A' || p === 'B' ? 10 : 90} width={16} height={30} fill={connected(p, i) ?? '#1a1d21'} stroke={C.edge} opacity={connected(p, i) ? 0.85 : 1} />
          <rect x={xs[i]! - 10} y={52} width={20} height={26} fill={connected(p, i) ?? '#1a1d21'} opacity={0.5} />
          <text x={xs[i]!} y={p === 'A' || p === 'B' ? 8 : 128} fontSize={10} fill="#c9d1d9" textAnchor="middle">
            {p}
          </text>
        </g>
      ))}
      <g transform={`translate(${shift},0)`} style={{ transition: 'transform 0.15s linear' }}>
        <rect x={0} y={60} width={240} height={10} fill="#6c7680" />
        {(four ? [20, 80, 140, 200] : [18, 92, 166]).map((x) => (
          <rect key={x} x={x} y={52} width={four ? 22 : 26} height={26} fill={C.metal} stroke="#59626c" />
        ))}
      </g>
      <text x={120} y={34} fontSize={9} fill="#8a939d" textAnchor="middle">
        spool {spool > 0.3 ? 'shifted (+)' : spool < -0.3 ? 'shifted (−)' : 'centred'}
      </text>
    </svg>
  );
}

export function ReliefCutaway({ opening, pressure, setting }: { opening: number; pressure: number; setting: number }) {
  const lift = Math.min(1, opening) * 14;
  const springTop = 22;
  const coils = 7;
  const springPts = Array.from({ length: coils * 2 + 1 }, (_, i) => `${i % 2 ? 132 : 108},${springTop + ((70 - lift - springTop) * i) / (coils * 2)}`).join(' ');
  return (
    <svg viewBox="0 0 240 160" width="100%" role="img" aria-label="Relief valve cutaway">
      <rect x={90} y={10} width={60} height={120} fill={C.body} stroke={C.edge} />
      <rect x={100} y={16} width={40} height={84} fill="#1a1d21" />
      <rect x={112} y={0} width={16} height={14} fill="#c8a23a" />
      <polyline points={springPts} fill="none" stroke={C.metal} strokeWidth={2} />
      <polygon points={`104,${84 - lift} 136,${84 - lift} 120,${100 - lift}`} fill={C.metal} />
      <rect x={110} y={100} width={20} height={50} fill={C.oilP} opacity={0.75} />
      <rect x={140} y={70} width={60} height={14} fill={opening > 0.01 ? C.oilT : '#1a1d21'} stroke={C.edge} />
      <text x={120} y={158} fontSize={9} fill={C.oilP} textAnchor="middle">P {(pressure / 1e5).toFixed(0)} bar</text>
      <text x={204} y={66} fontSize={9} fill={C.oilT}>to T</text>
      <text x={40} y={40} fontSize={9} fill="#8a939d">spring set</text>
      <text x={40} y={52} fontSize={9} fill="#8a939d">{(setting / 1e5).toFixed(0)} bar</text>
      <text x={40} y={92} fontSize={9} fill={opening > 0.01 ? 'var(--accent)' : '#8a939d'}>{opening > 0.01 ? 'POPPET OPEN' : 'closed'}</text>
    </svg>
  );
}

export function CylinderCutaway({ extension, stages = 1, single = false, leaking = false, pressure }: { extension: number; stages?: number; single?: boolean; leaking?: boolean; pressure: number }) {
  const x = 30 + extension * 150;
  return (
    <svg viewBox="0 0 260 110" width="100%" role="img" aria-label="Cylinder cutaway">
      <rect x={20} y={25} width={170} height={60} fill={C.body} stroke={C.edge} />
      <rect x={24} y={29} width={x - 24} height={52} fill={C.oilW} opacity={0.55} />
      {!single && <rect x={x + 10} y={29} width={186 - x - 10} height={52} fill={C.oilT} opacity={0.35} />}
      {Array.from({ length: stages - 1 }, (_, i) => (
        <rect key={i} x={24 + i * 6} y={33 + i * 6} width={160} height={44 - i * 12} fill="none" stroke="#6c7680" strokeDasharray="3 2" />
      ))}
      <rect x={x} y={29} width={10} height={52} fill={C.metal} />
      {leaking && <rect x={x} y={29} width={10} height={52} fill="none" stroke="var(--danger)" strokeWidth={2} />}
      <rect x={x + 10} y={48} width={250 - x - 10} height={14} fill="#c7ccd1" />
      <rect x={24} y={85} width={12} height={20} fill={C.oilW} />
      <text x={30} y={18} fontSize={9} fill="#8a939d">cap end {(pressure / 1e5).toFixed(0)} bar</text>
      {single && <text x={150} y={18} fontSize={9} fill="#8a939d">rod side vented (breather)</text>}
    </svg>
  );
}

export function PtoCutaway({ engaged, rpm }: { engaged: boolean; rpm: number }) {
  const a = useSpin(rpm, 16);
  const slide = engaged ? 0 : 22;
  return (
    <svg viewBox="0 0 240 140" width="100%" role="img" aria-label={`PTO cutaway ${engaged ? 'engaged' : 'disengaged'}`}>
      <rect x={10} y={10} width={220} height={120} rx={8} fill={C.body} stroke={C.edge} />
      <path d={gearPath(70, 60, 34, 14)} fill="#8a939d" transform={`rotate(${a} 70 60)`} />
      <text x={70} y={110} fontSize={9} fill="#8a939d" textAnchor="middle">transmission gear</text>
      <g transform={`translate(0,${slide})`}>
        <path d={gearPath(140, 60, 28, 12)} fill={engaged ? '#c9d1d9' : '#5d646b'} transform={`rotate(${engaged ? -a * 1.2 : 0} 140 60)`} />
        <rect x={168} y={56} width={60} height={8} fill={engaged ? '#c9d1d9' : '#5d646b'} />
      </g>
      <rect x={130} y={8} width={20} height={12} fill={engaged ? 'var(--ok)' : '#3a3f45'} />
      <text x={150} y={118} fontSize={9} fill={engaged ? 'var(--ok)' : '#8a939d'}>{engaged ? 'ENGAGED – shift fork in' : 'disengaged – gear slid out of mesh'}</text>
    </svg>
  );
}

import type { ReactNode } from 'react';
import type { ComponentInstanceDefinition } from '@/simulation/hydraulics/types';
import { DCV_VARIANTS } from '@/simulation/components/valves';
import { getModel } from '@/simulation/components/registry';

export type Side = 'top' | 'bottom' | 'left' | 'right';
export interface PortAnchor {
  x: number;
  y: number;
  side: Side;
}
export interface SymbolLive {
  /** readout map */
  r: Record<string, number | string | boolean>;
  inputs: Record<string, number>;
  active: boolean;
}
export interface SymbolGeometry {
  w: number;
  h: number;
  ports: Record<string, PortAnchor>;
  render(live: SymbolLive | null): ReactNode;
}

const S = { stroke: 'var(--sym-stroke, #c9d1d9)', fill: 'none', strokeWidth: 1.6 } as const;
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

function spring(x: number, y: number, len: number, vertical = false) {
  const n = 5;
  const pts: string[] = [];
  for (let i = 0; i <= n * 2; i++) {
    const t = (i / (n * 2)) * len;
    const o = i === 0 || i === n * 2 ? 0 : i % 2 ? 5 : -5;
    pts.push(vertical ? `${x + o},${y + t}` : `${x + t},${y + o}`);
  }
  return <polyline points={pts.join(' ')} {...S} strokeWidth={1.2} />;
}

function arrowHead(x: number, y: number, dir: 'up' | 'down' | 'left' | 'right', size = 5, fill = '#c9d1d9') {
  const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
  const [dx, dy] = d as [number, number];
  const px = -dy;
  const py = dx;
  return <polygon points={`${x + dx * size},${y + dy * size} ${x + px * size * 0.7},${y + py * size * 0.7} ${x - px * size * 0.7},${y - py * size * 0.7}`} fill={fill} />;
}

const pumpGeom = (variable: boolean, manual: boolean, motor = false): SymbolGeometry => ({
  w: 60,
  h: 60,
  ports: motor
    ? { A: { x: 30, y: 60, side: 'bottom' }, B: { x: 30, y: 0, side: 'top' }, CD: { x: 60, y: 30, side: 'right' } }
    : { IN: { x: 30, y: 60, side: 'bottom' }, OUT: { x: 30, y: 0, side: 'top' }, CD: { x: 60, y: 30, side: 'right' } },
  render(live) {
    const speed = num(live?.r.speed);
    const cav = live?.r.cavitating === true;
    return (
      <g>
        <circle cx={30} cy={30} r={22} {...S} stroke={cav ? 'var(--warn)' : S.stroke} />
        {motor ? <polygon points="30,12 24,22 36,22" fill="#c9d1d9" transform="rotate(180 30 17)" /> : <polygon points="30,8 23,19 37,19" fill="#c9d1d9" />}
        {variable && <line x1={12} y1={46} x2={48} y2={14} {...S} />}
        {variable && arrowHead(48, 14, 'up', 4)}
        {manual && <line x1={52} y1={30} x2={66} y2={18} {...S} />}
        <g style={{ transformOrigin: '30px 30px', animation: Math.abs(speed) > 5 ? `ha-spin ${Math.max(0.15, 60 / Math.abs(speed) * 3)}s linear infinite ${speed < 0 ? 'reverse' : ''}` : undefined }}>
          <line x1={30} y1={26} x2={30} y2={40} stroke="#6c7680" strokeWidth={1.2} />
          <circle cx={30} cy={40} r={2} fill="#6c7680" />
        </g>
      </g>
    );
  },
});

function dcvGeom(def: ComponentInstanceDefinition): SymbolGeometry {
  const variant = DCV_VARIANTS[String(def.params.variant ?? '4-3-tandem')] ?? DCV_VARIANTS['4-3-tandem']!;
  const box = 40;
  const x0 = 16;
  const W = x0 * 2 + box * 3;
  const four = variant.ports.includes('B');
  // centre box port anchors
  const cx = x0 + box;
  const portPos: Record<string, PortAnchor> = {
    P: { x: cx + 12, y: box, side: 'bottom' },
    T: { x: cx + 28, y: box, side: 'bottom' },
    A: { x: cx + 12, y: 0, side: 'top' },
  };
  if (four) portPos.B = { x: cx + 28, y: 0, side: 'top' };
  const local = (p: string) => ({ P: [12, box - 4], T: [28, box - 4], A: [12, 4], B: [28, 4] })[p as 'P'] as [number, number];
  const drawPaths = (paths: [string, string][], bx: number, color: string) =>
    paths.map(([a, b], i) => {
      const [ax, ay] = local(a);
      const [bx2, by] = local(b);
      if (a === 'P' && b === 'T') return <path key={i} d={`M${bx + ax},${ay} C${bx + ax},${ay - 14} ${bx + bx2},${by - 14} ${bx + bx2},${by}`} stroke={color} fill="none" strokeWidth={1.4} />;
      const up = ay > by;
      return (
        <g key={i}>
          <line x1={bx + ax} y1={ay} x2={bx + bx2} y2={by + (up ? 4 : -4)} stroke={color} strokeWidth={1.4} />
          {arrowHead(bx + bx2, by + (up ? 4 : -4), up ? 'up' : 'down', 4, color)}
        </g>
      );
    });
  const blocked = (ports: string[], used: [string, string][], bx: number) =>
    ports
      .filter((p) => !used.some(([a, b]) => a === p || b === p))
      .map((p) => {
        const [x, y] = local(p);
        const yy = y < box / 2 ? y + 6 : y - 6;
        return <line key={p} x1={bx + x - 4} y1={yy} x2={bx + x + 4} y2={yy} stroke="#9aa3ad" strokeWidth={1.4} />;
      });
  return {
    w: W,
    h: box,
    ports: portPos,
    render(live) {
      const spool = num(live?.r.spool);
      const activeBox = spool > 0.5 ? 0 : spool < -0.5 ? 2 : 1;
      const boxes: { paths: [string, string][]; i: number }[] = [
        { paths: variant.plus, i: 0 },
        { paths: variant.center, i: 1 },
        { paths: variant.minus, i: 2 },
      ];
      // spool animation: shift drawing so the active box sits over the ports
      const shift = -spool * box;
      const sol = def.params.actuation === 'solenoid';
      return (
        <g>
          <g transform={`translate(${shift},0)`} style={{ transition: 'transform 0.15s linear' }}>
            {boxes.map((b) => {
              const bx = x0 + b.i * box;
              const hot = live && b.i === activeBox;
              return (
                <g key={b.i}>
                  <rect x={bx} y={0} width={box} height={box} {...S} fill={hot ? 'rgba(242,169,59,0.10)' : 'none'} stroke={hot ? 'var(--accent)' : S.stroke} />
                  {drawPaths(b.paths, bx, hot ? 'var(--accent)' : '#c9d1d9')}
                  {blocked(variant.ports, b.paths, bx)}
                </g>
              );
            })}
            {sol ? (
              <>
                <rect x={2} y={10} width={14} height={20} {...S} />
                <line x1={2} y1={30} x2={16} y2={10} {...S} strokeWidth={1.1} />
                <rect x={W - 16} y={10} width={14} height={20} {...S} />
                <line x1={W - 16} y1={30} x2={W - 2} y2={10} {...S} strokeWidth={1.1} />
              </>
            ) : (
              <>
                <line x1={0} y1={20} x2={16} y2={20} {...S} />
                <line x1={0} y1={12} x2={0} y2={28} {...S} />
              </>
            )}
          </g>
          {!sol && spring(W - 16, 20, 14)}
          {sol && <text x={2} y={-4} fontSize={8} fill="#8a939d">S1</text>}
          {sol && <text x={W - 14} y={-4} fontSize={8} fill="#8a939d">S2</text>}
        </g>
      );
    },
  };
}

function valveBox(labelPorts: Record<string, PortAnchor>, inner: (live: SymbolLive | null) => ReactNode, w = 44, h = 60): SymbolGeometry {
  return {
    w,
    h,
    ports: labelPorts,
    render: (live) => (
      <g>
        <rect x={4} y={8} width={w - 8} height={h - 16} {...S} />
        {inner(live)}
      </g>
    ),
  };
}

export function symbolFor(def: ComponentInstanceDefinition): SymbolGeometry {
  switch (def.type) {
    case 'pump-gear':
    case 'pump-vane':
      return pumpGeom(false, false);
    case 'pump-piston-pc':
      return pumpGeom(true, false);
    case 'pump-manual':
      return pumpGeom(false, true);
    case 'motor':
      return pumpGeom(false, false, true);
    case 'relief-valve':
      return valveBox({ P: { x: 22, y: 60, side: 'bottom' }, T: { x: 22, y: 0, side: 'top' } }, (live) => {
        const open = num(live?.r.opening) > 0.02 || live?.r.open === true;
        return (
          <g>
            <line x1={22} y1={52} x2={22} y2={60} {...S} />
            <line x1={22} y1={0} x2={22} y2={8} {...S} />
            <line x1={open ? 22 : 28} y1={46} x2={open ? 22 : 28} y2={16} stroke={open ? 'var(--accent)' : S.stroke} strokeWidth={1.6} />
            {arrowHead(open ? 22 : 28, 15, 'up', 5, open ? 'var(--accent)' : '#c9d1d9')}
            {spring(8, 18, 22, true)}
            <line x1={22} y1={56} x2={36} y2={56} stroke="#9aa3ad" strokeDasharray="3 2" strokeWidth={1} />
            <line x1={36} y1={56} x2={36} y2={40} stroke="#9aa3ad" strokeDasharray="3 2" strokeWidth={1} />
          </g>
        );
      });
    case 'dcv':
      return dcvGeom(def);
    case 'check-valve':
      return {
        w: 30,
        h: 44,
        ports: { IN: { x: 15, y: 44, side: 'bottom' }, OUT: { x: 15, y: 0, side: 'top' } },
        render: () => (
          <g>
            <line x1={15} y1={0} x2={15} y2={14} {...S} />
            <line x1={15} y1={30} x2={15} y2={44} {...S} />
            <circle cx={15} cy={24} r={6} {...S} />
            <polyline points="5,14 15,22 25,14" {...S} />
          </g>
        ),
      };
    case 'pilot-check':
    case 'counterbalance':
      return valveBox({ V: { x: 22, y: 60, side: 'bottom' }, L: { x: 22, y: 0, side: 'top' }, X: { x: 44, y: 30, side: 'right' } }, (live) => (
        <g>
          <circle cx={22} cy={30} r={6} {...S} stroke={num(live?.r.opening) > 0.05 ? 'var(--accent)' : S.stroke} />
          <polyline points="14,22 22,28 30,22" {...S} />
          <line x1={22} y1={8} x2={22} y2={22} {...S} />
          <line x1={22} y1={38} x2={22} y2={52} {...S} />
          <line x1={30} y1={30} x2={44} y2={30} stroke="#9aa3ad" strokeDasharray="3 2" />
          {def.type === 'counterbalance' && spring(8, 18, 22, true)}
        </g>
      ));
    case 'pressure-reducing':
      return valveBox({ P: { x: 22, y: 60, side: 'bottom' }, A: { x: 22, y: 0, side: 'top' }, Y: { x: 44, y: 46, side: 'right' } }, () => (
        <g>
          <line x1={22} y1={0} x2={22} y2={60} {...S} />
          {arrowHead(22, 14, 'up', 5)}
          {spring(30, 18, 22, true)}
          <line x1={10} y1={14} x2={10} y2={30} stroke="#9aa3ad" strokeDasharray="3 2" />
        </g>
      ));
    case 'unloading-valve':
      return valveBox({ P: { x: 22, y: 60, side: 'bottom' }, T: { x: 22, y: 0, side: 'top' }, X: { x: 0, y: 30, side: 'left' } }, () => (
        <g>
          <line x1={28} y1={46} x2={28} y2={16} {...S} />
          {arrowHead(28, 15, 'up', 5)}
          {spring(36, 18, 22, true)}
          <line x1={0} y1={30} x2={10} y2={30} stroke="#9aa3ad" strokeDasharray="3 2" />
        </g>
      ));
    case 'priority-valve':
      return valveBox({ P: { x: 22, y: 60, side: 'bottom' }, CF: { x: 12, y: 0, side: 'top' }, EF: { x: 34, y: 0, side: 'top' } }, () => (
        <g>
          <line x1={22} y1={52} x2={12} y2={10} {...S} />
          <line x1={22} y1={52} x2={34} y2={10} {...S} />
          {arrowHead(12, 10, 'up', 4)}
          {arrowHead(34, 10, 'up', 4)}
        </g>
      ));
    case 'flow-control':
    case 'orifice':
      return {
        w: 36,
        h: 50,
        ports: { IN: { x: 18, y: 50, side: 'bottom' }, OUT: { x: 18, y: 0, side: 'top' } },
        render: () => (
          <g>
            <line x1={18} y1={0} x2={18} y2={50} {...S} />
            <path d="M8,15 Q18,25 8,35" {...S} />
            <path d="M28,15 Q18,25 28,35" {...S} />
            {def.type === 'flow-control' && (
              <>
                <line x1={4} y1={40} x2={32} y2={10} {...S} />
                {arrowHead(32, 10, 'up', 4)}
              </>
            )}
            {def.type === 'flow-control' && def.params.compensated === true && <rect x={0} y={4} width={36} height={42} {...S} strokeDasharray="3 2" />}
          </g>
        ),
      };
    case 'cylinder': {
      const single = def.params.singleActing === true;
      const stages = Array.isArray(def.params.stages) ? (def.params.stages as number[]) : [Number(def.params.bore) || 80];
      return {
        w: 150,
        h: 40,
        ports: single ? { A: { x: 12, y: 40, side: 'bottom' } } : { A: { x: 12, y: 40, side: 'bottom' }, B: { x: 108, y: 40, side: 'bottom' } },
        render(live) {
          const ext = Math.max(0, Math.min(1, num(live?.r.extension)));
          const px = 10 + ext * 96;
          return (
            <g>
              <rect x={4} y={4} width={112} height={32} {...S} />
              {stages.length > 1 &&
                stages.slice(1).map((_, i) => <rect key={i} x={4 + 6 * (i + 1)} y={4 + 4 * (i + 1)} width={112 - 6 * (i + 1)} height={32 - 8 * (i + 1)} stroke="#6c7680" fill="none" strokeWidth={0.8} />)}
              <rect x={px} y={6} width={6} height={28} fill="#c9d1d9" style={{ transition: 'x 0.1s linear' }} />
              <rect x={px + 6} y={17} width={150 - px - 6} height={6} fill="#9aa3ad" />
              {single && <text x={96} y={-3} fontSize={8} fill="#8a939d">breather</text>}
              {single && <circle cx={108} cy={36} r={2} fill="#8a939d" />}
            </g>
          );
        },
      };
    }
    case 'reservoir':
      return {
        w: 80,
        h: 44,
        ports: { S: { x: 16, y: 0, side: 'top' }, R: { x: 40, y: 0, side: 'top' }, D: { x: 64, y: 0, side: 'top' } },
        render(live) {
          const lvl = Math.max(0, Math.min(1, num(live?.r.level, 0.7)));
          return (
            <g>
              <rect x={4} y={44 - 4 - lvl * 32} width={72} height={lvl * 32} fill="rgba(242,169,59,0.18)" />
              <polyline points="4,6 4,40 76,40 76,6" {...S} />
              <line x1={16} y1={0} x2={16} y2={30} {...S} strokeWidth={1.2} />
              <line x1={40} y1={0} x2={40} y2={30} {...S} strokeWidth={1.2} />
              <line x1={64} y1={0} x2={64} y2={14} {...S} strokeWidth={1.2} />
            </g>
          );
        },
      };
    case 'filter':
    case 'cooler':
      return {
        w: 40,
        h: 48,
        ports: { IN: { x: 20, y: 48, side: 'bottom' }, OUT: { x: 20, y: 0, side: 'top' } },
        render(live) {
          const by = live?.r.bypassing === true;
          return (
            <g>
              <polygon points="20,4 38,24 20,44 2,24" {...S} stroke={by ? 'var(--danger)' : S.stroke} />
              {def.type === 'filter' ? (
                <line x1={2} y1={24} x2={38} y2={24} stroke="#9aa3ad" strokeDasharray="3 2" />
              ) : (
                <>
                  <line x1={20} y1={4} x2={20} y2={44} {...S} />
                  {arrowHead(36, 10, 'right', 4)}
                  {arrowHead(4, 38, 'left', 4)}
                </>
              )}
            </g>
          );
        },
      };
    case 'accumulator':
      return {
        w: 30,
        h: 54,
        ports: { P: { x: 15, y: 54, side: 'bottom' } },
        render: () => (
          <g>
            <rect x={3} y={4} width={24} height={42} rx={12} {...S} />
            <line x1={3} y1={25} x2={27} y2={25} {...S} />
            <line x1={15} y1={46} x2={15} y2={54} {...S} />
          </g>
        ),
      };
    case 'gauge':
    case 'temp-sensor':
      return {
        w: 32,
        h: 40,
        ports: { G: { x: 16, y: 40, side: 'bottom' } },
        render(live) {
          const p = num(live?.r.pressure);
          const range = (Number(def.params.range) || 250) * 1e5;
          const a = def.type === 'gauge' ? -220 + Math.max(0, Math.min(1, p / range)) * 260 : 0;
          return (
            <g>
              <circle cx={16} cy={16} r={13} {...S} />
              {def.type === 'gauge' ? <line x1={16} y1={16} x2={16 + 9 * Math.cos((a * Math.PI) / 180)} y2={16 + 9 * Math.sin((a * Math.PI) / 180)} stroke="var(--accent)" strokeWidth={1.6} /> : <text x={12} y={20} fontSize={11} fill="#c9d1d9">T</text>}
              <line x1={16} y1={29} x2={16} y2={40} {...S} />
            </g>
          );
        },
      };
    case 'flow-meter':
      return {
        w: 32,
        h: 48,
        ports: { IN: { x: 16, y: 48, side: 'bottom' }, OUT: { x: 16, y: 0, side: 'top' } },
        render: () => (
          <g>
            <circle cx={16} cy={24} r={13} {...S} />
            <line x1={16} y1={0} x2={16} y2={11} {...S} />
            <line x1={16} y1={37} x2={16} y2={48} {...S} />
            <line x1={8} y1={32} x2={24} y2={16} {...S} />
            {arrowHead(24, 16, 'up', 4)}
          </g>
        ),
      };
    default:
      return {
        w: 40,
        h: 40,
        ports: Object.fromEntries(getModel(def.type).ports(def).map((p, i) => [p.id, { x: 20, y: i % 2 ? 0 : 40, side: (i % 2 ? 'top' : 'bottom') as Side }])),
        render: () => <rect x={2} y={2} width={36} height={36} {...S} />,
      };
  }
}

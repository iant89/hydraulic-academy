import { useEffect, useMemo, useRef, type PointerEvent as RPE } from 'react';
import type { CircuitDefinition, ConnectionDefinition, LineType, PortRef } from '@/simulation/hydraulics/types';
import type { HydraulicSimulation } from '@/simulation/hydraulics/simulation';
import { BAR, circleArea } from '@/simulation/core/units';
import { getModel } from '@/simulation/components/registry';
import { symbolFor, type PortAnchor, type SymbolLive } from './symbols';
import { cx } from '@/components/ui';
import s from './Schematic.module.css';

export const CELL = 44;

export const LINE_COLORS: Record<LineType, string> = {
  pressure: 'var(--line-pressure)',
  return: 'var(--line-return)',
  suction: 'var(--line-suction)',
  pilot: 'var(--line-pilot)',
  'case-drain': 'var(--line-drain)',
  'load-sense': 'var(--line-ls)',
  work: 'var(--line-work)',
};
export const LINE_LABELS: Record<LineType, string> = {
  pressure: 'Pressure',
  return: 'Return',
  suction: 'Suction',
  pilot: 'Pilot',
  'case-drain': 'Case drain',
  'load-sense': 'Load sense',
  work: 'Work (actuator)',
};
const DASH: Partial<Record<LineType, string>> = { pilot: '6 4', 'case-drain': '2 3', 'load-sense': '6 2 2 2' };

export type Selection = { kind: 'component' | 'connection'; id: string } | null;

export interface SchematicProps {
  circuit: CircuitDefinition;
  sim?: HydraulicSimulation | null;
  tick?: number;
  mode?: 'flow' | 'pressure' | 'static';
  selected?: Selection;
  onSelect?(s: Selection): void;
  editable?: boolean;
  onMove?(id: string, x: number, y: number): void;
  onPortClick?(ref: PortRef): void;
  pendingPort?: PortRef | null;
  issuePorts?: Set<string>;
  issueConnections?: Set<string>;
  testPoints?: { id: string; component: string; port: string }[];
  readings?: { component: string; port: string; text: string }[];
  showPortLabels?: boolean;
  minCells?: [number, number];
  legend?: boolean;
  ariaLabel?: string;
}

type Pt = [number, number];
const normal = (side: PortAnchor['side']): Pt => (side === 'top' ? [0, -1] : side === 'bottom' ? [0, 1] : side === 'left' ? [-1, 0] : [1, 0]);

function route(a: Pt, sa: PortAnchor['side'], b: Pt, sb: PortAnchor['side']): Pt[] {
  const [nax, nay] = normal(sa);
  const [nbx, nby] = normal(sb);
  const a1: Pt = [a[0] + nax * 14, a[1] + nay * 14];
  const b1: Pt = [b[0] + nbx * 14, b[1] + nby * 14];
  const vertA = sa === 'top' || sa === 'bottom';
  const corner: Pt = vertA ? [b1[0], a1[1]] : [a1[0], b1[1]];
  return [a, a1, corner, b1, b];
}

const pathD = (pts: Pt[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

function heat(pBar: number): string {
  const t = Math.max(0, Math.min(1, pBar / 220));
  const h = 220 - t * 220;
  return `hsl(${h.toFixed(0)}, 80%, ${50 + (1 - t) * 5}%)`;
}

export function Schematic(props: SchematicProps) {
  const { circuit, sim, mode = 'flow', selected, onSelect, editable, onMove, onPortClick, pendingPort, issuePorts, issueConnections, testPoints, readings, showPortLabels = true, minCells = [10, 8], legend = true } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const flowRefs = useRef(new Map<string, SVGPathElement>());
  const flowSpeed = useRef(new Map<string, number>());
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const geoms = useMemo(() => new Map(circuit.components.filter((c) => c.type !== 'open-port').map((c) => [c.id, symbolFor(c)])), [circuit]);

  const portWorld = (ref: PortRef): { p: Pt; side: PortAnchor['side'] } | null => {
    const c = circuit.components.find((x) => x.id === ref.component);
    const g = geoms.get(ref.component);
    if (!c || !g) return null;
    const a = g.ports[ref.port];
    if (!a) return null;
    const x = (c.layout?.x ?? 0) * CELL;
    const y = (c.layout?.y ?? 0) * CELL;
    return { p: [x + a.x, y + a.y], side: a.side };
  };

  // Extents
  let maxX = minCells[0] * CELL;
  let maxY = minCells[1] * CELL;
  let minX = 0;
  let minY = 0;
  for (const c of circuit.components) {
    const g = geoms.get(c.id);
    if (!g) continue;
    const x = (c.layout?.x ?? 0) * CELL;
    const y = (c.layout?.y ?? 0) * CELL;
    maxX = Math.max(maxX, x + g.w + 60);
    maxY = Math.max(maxY, y + g.h + 40);
    minX = Math.min(minX, x - 40);
    minY = Math.min(minY, y - 40);
  }
  const vb = editable ? `0 0 ${maxX} ${maxY}` : `${minX - 10} ${minY - 10} ${maxX - minX + 20} ${maxY - minY + 20}`;

  // live data
  const live = new Map<string, SymbolLive>();
  if (sim) {
    for (const c of circuit.components) {
      if (!sim.components.has(c.id)) continue;
      const r: SymbolLive['r'] = {};
      for (const x of sim.readouts(c.id)) r[x.key] = x.value;
      live.set(c.id, { r, inputs: sim.components.get(c.id)!.inputs, active: true });
    }
  }

  const conns = circuit.connections.map((cn) => {
    const a = portWorld(cn.from);
    const b = portWorld(cn.to);
    if (!a || !b) return null;
    const pts = route(a.p, a.side, b.p, b.side);
    let q = 0;
    let pMax = 0;
    if (sim) {
      q = sim.flowThrough(cn.id);
      pMax = Math.max(sim.pressureAt(cn.from.component, cn.from.port) || 0, sim.pressureAt(cn.to.component, cn.to.port) || 0);
    }
    return { cn, pts, q, pMax };
  });

  // velocity → dash speed
  for (const c of conns) {
    if (!c) continue;
    const v = c.q / circleArea(c.cn.hose.innerDiameter);
    flowSpeed.current.set(c.cn.id, Math.abs(c.q) > 1e-6 ? Math.sign(v) * Math.min(160, 14 + Math.abs(v) * 22) : 0);
  }

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const off = new Map<string, number>();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      for (const [id, el] of flowRefs.current) {
        const sp = flowSpeed.current.get(id) ?? 0;
        const o = (off.get(id) ?? 0) - sp * dt;
        off.set(id, o % 1200);
        el.style.strokeDashoffset = String(o % 1200);
        el.style.opacity = sp === 0 ? '0' : '1';
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const toSvg = (e: RPE): Pt => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    if (!m) return [0, 0];
    const r = pt.matrixTransform(m.inverse());
    return [r.x, r.y];
  };

  const onCompDown = (e: RPE, id: string) => {
    e.stopPropagation();
    onSelect?.({ kind: 'component', id });
    if (!editable) return;
    const c = circuit.components.find((x) => x.id === id)!;
    const [x, y] = toSvg(e);
    drag.current = { id, dx: x - (c.layout?.x ?? 0) * CELL, dy: y - (c.layout?.y ?? 0) * CELL };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onMoveEvt = (e: RPE) => {
    if (!drag.current || !onMove) return;
    const [x, y] = toSvg(e);
    const gx = Math.max(0, Math.round(((x - drag.current.dx) / CELL) * 2) / 2);
    const gy = Math.max(0, Math.round(((y - drag.current.dy) / CELL) * 2) / 2);
    onMove(drag.current.id, gx, gy);
  };
  const onUp = () => {
    drag.current = null;
  };

  const portKey = (r: PortRef) => `${r.component}.${r.port}`;

  return (
    <div className={s.wrap}>
      <svg ref={svgRef} className={s.svg} viewBox={vb} preserveAspectRatio="xMidYMid meet" role="img" aria-label={props.ariaLabel ?? `Hydraulic schematic: ${circuit.name}`} onPointerMove={onMoveEvt} onPointerUp={onUp} onPointerDown={() => onSelect?.(null)}>
        {editable && (
          <g opacity={0.35}>
            {Array.from({ length: Math.ceil(maxX / CELL) + 1 }, (_, i) => (
              <line key={`gx${i}`} x1={i * CELL} y1={0} x2={i * CELL} y2={maxY} stroke="#1d2126" />
            ))}
            {Array.from({ length: Math.ceil(maxY / CELL) + 1 }, (_, i) => (
              <line key={`gy${i}`} x1={0} y1={i * CELL} x2={maxX} y2={i * CELL} stroke="#1d2126" />
            ))}
          </g>
        )}
        {conns.map((c) => {
          if (!c) return null;
          const { cn, pts, pMax } = c;
          const color = mode === 'pressure' && sim ? heat(pMax / BAR) : LINE_COLORS[cn.lineType];
          const d = pathD(pts);
          const sel = selected?.kind === 'connection' && selected.id === cn.id;
          const bad = issueConnections?.has(cn.id);
          return (
            <g key={cn.id} onPointerDown={(e) => { e.stopPropagation(); onSelect?.({ kind: 'connection', id: cn.id }); }}>
              <title>{`${cn.label ?? cn.id} – ${LINE_LABELS[cn.lineType]}${sim ? ` · ${(c.q * 60000).toFixed(1)} L/min · ${(pMax / BAR).toFixed(0)} bar` : ''}`}</title>
              <path d={d} className={s.lineHit} />
              <path d={d} className={cx(s.line, sel && s.lineSel)} stroke={bad ? 'var(--danger)' : color} strokeDasharray={DASH[cn.lineType]} />
              {sim && mode !== 'static' && (
                <path
                  d={d}
                  className={s.flow}
                  ref={(el) => {
                    if (el) flowRefs.current.set(cn.id, el);
                    else flowRefs.current.delete(cn.id);
                  }}
                />
              )}
            </g>
          );
        })}
        {circuit.components.map((c) => {
          const g = geoms.get(c.id);
          if (!g) return null;
          const x = (c.layout?.x ?? 0) * CELL;
          const y = (c.layout?.y ?? 0) * CELL;
          const sel = selected?.kind === 'component' && selected.id === c.id;
          const ports = getModel(c.type).ports(c);
          return (
            <g key={c.id} transform={`translate(${x},${y})`} className={cx(s.comp, sel && s.sel)}>
              <rect className="hit" x={-6} y={-6} width={g.w + 12} height={g.h + 12} fill="transparent" stroke="transparent" rx={4} onPointerDown={(e) => onCompDown(e, c.id)} />
              <g pointerEvents="none">{g.render(live.get(c.id) ?? null)}</g>
              <text className={s.label} x={g.w / 2} y={g.h + 16} textAnchor="middle">
                {c.label}
              </text>
              {ports.map((p) => {
                const a = g.ports[p.id];
                if (!a) return null;
                const k = portKey({ component: c.id, port: p.id });
                const pending = pendingPort && portKey(pendingPort) === k;
                const lx = a.side === 'left' ? -10 : a.side === 'right' ? 10 : 9;
                const ly = a.side === 'top' ? -5 : a.side === 'bottom' ? 12 : -5;
                return (
                  <g
                    key={p.id}
                    className={cx(s.port, pending && s.portPending, issuePorts?.has(k) && s.portIssue)}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      onPortClick?.({ component: c.id, port: p.id });
                    }}
                  >
                    <title>{`${c.label} – port ${p.marking}: ${p.label}. ${p.description}`}</title>
                    <circle cx={a.x} cy={a.y} r={onPortClick ? 5 : 3} />
                    {showPortLabels && (
                      <text className={s.portLabel} x={a.x + lx} y={a.y + ly} textAnchor={a.side === 'left' ? 'end' : 'start'}>
                        {p.marking}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
        {testPoints?.map((tp) => {
          const w = portWorld({ component: tp.component, port: tp.port });
          if (!w) return null;
          return (
            <g key={tp.id}>
              <circle cx={w.p[0] - 10} cy={w.p[1] + (w.side === 'top' ? -10 : 10)} r={3} fill="#45b4d6" />
              <text className={s.tp} x={w.p[0] - 34} y={w.p[1] + (w.side === 'top' ? -14 : 22)}>
                {tp.id}
              </text>
            </g>
          );
        })}
        {readings?.map((r, i) => {
          const w = portWorld({ component: r.component, port: r.port });
          if (!w) return null;
          const tx = w.p[0] + 12;
          const ty = w.p[1] + (w.side === 'top' ? -18 : 18);
          return (
            <g key={i}>
              <rect className={s.readingBg} x={tx - 3} y={ty - 10} width={r.text.length * 6.2 + 6} height={14} rx={3} />
              <text className={s.reading} x={tx} y={ty}>
                {r.text}
              </text>
            </g>
          );
        })}
      </svg>
      {legend && (
        <div className={s.legend} aria-hidden>
          {(mode === 'pressure' && sim
            ? [
                ['0 bar', heat(0)],
                ['100 bar', heat(100)],
                ['200+ bar', heat(220)],
              ]
            : (Object.keys(LINE_LABELS) as LineType[]).filter((k) => circuit.connections.some((c) => c.lineType === k)).map((k) => [LINE_LABELS[k], LINE_COLORS[k]]))
            .map(([l, c]) => (
              <span key={l}>
                <i style={{ background: c }} />
                {l}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

export function connectionLabel(cn: ConnectionDefinition) {
  return cn.label ?? cn.id;
}

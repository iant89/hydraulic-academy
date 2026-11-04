import { BAR, LPM, clamp } from '../core/units';
import { orificeFlow } from '../physics/flow';
import type { ComponentInstanceDefinition, PortDefinition, StepEnv } from '../hydraulics/types';
import { type ComponentModel, baseRuntime, branch, element, num, port, str } from './base';

const MM2 = 1e-6;
/** Orifice area that passes `q` at `dp` – used to size full-open valve areas from rated data. */
export const areaFor = (q: number, dp: number, rho = 870) => q / (0.62 * Math.sqrt((2 * dp) / rho));

// ───────────────────────────── Pressure relief valve ─────────────────────────────
/**
 * Direct-acting relief: closed below the cracking pressure, opening
 * proportionally above it (pressure override band to full rated flow).
 */
export const reliefValveModel: ComponentModel = {
  type: 'relief-valve',
  name: 'Pressure relief valve',
  category: 'valve',
  symbol: 'relief',
  summary: 'Normally closed; opens to tank when inlet pressure overcomes the spring, limiting maximum system pressure.',
  ports: () => [
    port('P', 'P', 'Inlet (system pressure)', 'supply', 'Connect to the pressure line being protected.'),
    port('T', 'T', 'Outlet to tank', 'tank', 'Must return to tank without restriction – back pressure adds to the setting.'),
  ],
  params: [
    { key: 'crackingPressure', label: 'Setting (cracking)', quantity: 'none', min: 5, max: 350, default: 172, description: 'bar', live: true },
    { key: 'override', label: 'Pressure override to rated flow', quantity: 'none', min: 2, max: 40, default: 12, description: 'bar' },
    { key: 'ratedFlow', label: 'Rated flow', quantity: 'none', min: 5, max: 400, default: 120, description: 'L/min' },
  ],
  inputs: [{ key: 'setting', label: 'Setting', min: 5e5, max: 350e5, default: 172e5, quantity: 'pressure', step: 1e5 }],
  faultKinds: ['relief-stuck-open', 'relief-stuck-closed', 'relief-seat-leak', 'relief-misadjusted'],
  build(ctx, def) {
    const env = ctx.envRef;
    const rt = baseRuntime(def);
    const nP = ctx.port(def, 'P', 0.02e-3);
    const nT = ctx.port(def, 'T', 0.02e-3);
    rt.portNodes = { P: nP, T: nT };
    rt.inputs = { setting: num(def, 'crackingPressure', 172) * BAR };
    const override = num(def, 'override', 12) * BAR;
    const rated = num(def, 'ratedFlow', 120) * LPM;
    const Kr = rated / override;
    const fullArea = areaFor(rated, 5 * BAR);
    const sev = (k: string) => env.current.faults.severity(def.id, k);
    const setting = () => {
      const mis = sev('relief-misadjusted');
      // Misadjustment fault: setting backed off by up to 55 %.
      return (rt.inputs.setting ?? 172e5) * (1 - 0.55 * mis);
    };
    let lastQ = 0;
    const q = (pp: number, pt: number) => {
      const dp = pp - pt;
      const closed = sev('relief-stuck-closed');
      const pc = setting();
      let f = dp > pc ? Kr * (dp - pc) * (1 - closed) : 0;
      f += 2e-13 * dp; // seat leakage (well conditioned)
      const stuck = sev('relief-stuck-open');
      if (stuck > 0) f += orificeFlow(fullArea * stuck, dp, env.current.fluid.rho);
      const seat = sev('relief-seat-leak');
      if (seat > 0) f += orificeFlow(fullArea * 0.08 * seat, dp, env.current.fluid.rho);
      return f;
    };
    rt.elements.push(branch(`${def.id}:poppet`, def.id, `${def.label} poppet`, nP, nT, q));
    rt.postStep = (e) => {
      lastQ = q(e.pressure(nP), e.pressure(nT));
    };
    rt.getState = () => ({ setting: rt.inputs.setting ?? 0 });
    rt.setState = (s) => {
      if (typeof s.setting === 'number') rt.inputs.setting = s.setting;
    };
    rt.readouts = (e) => {
      const dp = e.pressure(nP) - e.pressure(nT);
      return [
        { key: 'setting', label: 'Adjusted setting', value: rt.inputs.setting ?? 0, quantity: 'pressure' },
        { key: 'inlet', label: 'Inlet pressure', value: e.pressure(nP), quantity: 'pressure' },
        { key: 'flow', label: 'Relief flow', value: lastQ, quantity: 'flow' },
        { key: 'open', label: 'Relieving', value: lastQ > 0.5 * LPM },
        { key: 'opening', label: 'Opening', value: clamp((dp - setting()) / override, 0, 1), quantity: 'ratio' },
      ];
    };
    return rt;
  },
};

// ───────────────────────────── Directional control valve ─────────────────────────────
type Path = [string, string];
interface Variant {
  ports: string[];
  center: Path[];
  plus: Path[];
  minus: Path[];
  label: string;
}
export const DCV_VARIANTS: Record<string, Variant> = {
  '3way-dump': {
    label: '3-way 3-position dump (hoist) valve – tandem centre',
    ports: ['P', 'T', 'A'],
    center: [['P', 'T']],
    plus: [['P', 'A']],
    minus: [['A', 'T'], ['P', 'T']],
  },
  '4-3-tandem': {
    label: '4/3 tandem centre',
    ports: ['P', 'T', 'A', 'B'],
    center: [['P', 'T']],
    plus: [['P', 'A'], ['B', 'T']],
    minus: [['P', 'B'], ['A', 'T']],
  },
  '4-3-closed': {
    label: '4/3 closed centre',
    ports: ['P', 'T', 'A', 'B'],
    center: [],
    plus: [['P', 'A'], ['B', 'T']],
    minus: [['P', 'B'], ['A', 'T']],
  },
  '4-3-open': {
    label: '4/3 open centre',
    ports: ['P', 'T', 'A', 'B'],
    center: [['P', 'T'], ['A', 'T'], ['B', 'T']],
    plus: [['P', 'A'], ['B', 'T']],
    minus: [['P', 'B'], ['A', 'T']],
  },
  '4-3-oc-float': {
    label: '4/3 open-centre section with power-beyond, A & B to tank in neutral (for load-holding valves)',
    ports: ['P', 'T', 'A', 'B', 'PB'],
    center: [['P', 'PB'], ['A', 'T'], ['B', 'T']],
    plus: [['P', 'A'], ['B', 'T']],
    minus: [['P', 'B'], ['A', 'T']],
  },
  '4-3-float': {
    label: '4/3 float centre',
    ports: ['P', 'T', 'A', 'B'],
    center: [['A', 'T'], ['B', 'T']],
    plus: [['P', 'A'], ['B', 'T']],
    minus: [['P', 'B'], ['A', 'T']],
  },
};

const DCV_PORT_INFO: Record<string, PortDefinition> = {
  P: port('P', 'P', 'Pressure inlet', 'supply', 'Supply from pump outlet.'),
  T: port('T', 'T', 'Tank return', 'tank', 'Return to tank through the return filter.'),
  A: port('A', 'A', 'Work port A', 'work', 'Actuator port – energised by the "+" spool position.'),
  B: port('B', 'B', 'Work port B', 'work', 'Actuator port – energised by the "−" spool position.'),
  PB: port('PB', 'PB', 'Power beyond (carry-over)', 'tank', 'Open-centre carry-over – feeds the next section’s P port or returns to tank.'),
};

export const dcvModel: ComponentModel = {
  type: 'dcv',
  name: 'Directional control valve (spool)',
  category: 'valve',
  symbol: 'dcv',
  summary: 'Sliding spool connects P, T and work ports in different combinations to start, stop and reverse actuators.',
  ports: (def) => (DCV_VARIANTS[str(def, 'variant', '4-3-tandem')] ?? DCV_VARIANTS['4-3-tandem']!).ports.map((p) => DCV_PORT_INFO[p]!),
  params: [
    {
      key: 'variant',
      label: 'Spool / centre type',
      quantity: 'none',
      default: '4-3-tandem',
      options: Object.entries(DCV_VARIANTS).map(([value, v]) => ({ value, label: v.label })),
    },
    { key: 'ratedFlow', label: 'Rated flow', quantity: 'none', min: 5, max: 400, default: 90, description: 'L/min at 5 bar per land' },
    { key: 'spoolTime', label: 'Spool shift time', quantity: 'time', min: 0.02, max: 2, default: 0.15 },
    { key: 'actuation', label: 'Actuation', quantity: 'none', default: 'lever', options: [
      { value: 'lever', label: 'Manual lever / cable' },
      { value: 'solenoid', label: 'Solenoid (spring-centred)' },
    ] },
  ],
  inputs: [{ key: 'command', label: 'Spool command', min: -1, max: 1, default: 0, quantity: 'ratio', step: 1 }],
  faultKinds: ['spool-stuck', 'dcv-internal-leak', 'dcv-restricted'],
  build(ctx, def) {
    const env = ctx.envRef;
    const rt = baseRuntime(def);
    const variant = DCV_VARIANTS[str(def, 'variant', '4-3-tandem')] ?? DCV_VARIANTS['4-3-tandem']!;
    const nodes: Record<string, number> = {};
    for (const p of variant.ports) nodes[p] = ctx.port(def, p, 0.03e-3);
    rt.portNodes = nodes;
    rt.inputs = { command: 0 };
    const area = areaFor(num(def, 'ratedFlow', 90) * LPM, 5 * BAR);
    const spoolTime = num(def, 'spoolTime', 0.15);
    let spool = 0;
    const sev = (k: string) => env.current.faults.severity(def.id, k);
    const weights = () => {
      const s = spool;
      const side = clamp((Math.abs(s) - 0.15) / 0.85, 0, 1);
      const center = clamp(1 - Math.abs(s) / 0.5, 0, 1);
      return { center, plus: s > 0 ? side : 0, minus: s < 0 ? side : 0 };
    };
    const paths: { from: string; to: string; key: 'center' | 'plus' | 'minus' }[] = [];
    (['center', 'plus', 'minus'] as const).forEach((key) => variant[key].forEach(([a, b]) => paths.push({ from: a, to: b, key })));
    paths.forEach((pth, i) => {
      const a = nodes[pth.from]!;
      const b = nodes[pth.to]!;
      rt.elements.push(
        branch(`${def.id}:path${i}`, def.id, `${def.label} ${pth.from}→${pth.to}`, a, b, (pa, pb) => {
          const w = weights()[pth.key];
          if (w <= 0) return 0;
          const restricted = 1 - 0.88 * sev('dcv-restricted');
          return orificeFlow(area * w * restricted, pa - pb, env.current.fluid.rho);
        }),
      );
    });
    // Spool land clearance leakage: work ports ↔ tank and P ↔ work ports.
    const leakPairs: Path[] = variant.ports.filter((p) => p === 'A' || p === 'B').flatMap((w) => [[w, 'T'] as Path, ['P', w] as Path]);
    leakPairs.forEach(([a, b], i) => {
      rt.elements.push(
        branch(`${def.id}:leak${i}`, def.id, `${def.label} spool leakage ${a}→${b}`, nodes[a]!, nodes[b]!, (pa, pb) => {
          const e = env.current;
          const s = sev('dcv-internal-leak');
          const G = 4e-14 * (1 + 200 * s) * (e.fluid.muRef / e.fluid.mu);
          const extra = s > 0 ? orificeFlow(0.35 * MM2 * s, pa - pb, e.fluid.rho) : 0;
          return G * (pa - pb) + extra;
        }),
      );
    });
    rt.preStep = (e: StepEnv) => {
      const stuck = sev('spool-stuck') > 0.5;
      if (stuck) return;
      const target = clamp(rt.inputs.command ?? 0, -1, 1);
      const rate = e.dt / spoolTime;
      if (Math.abs(target - spool) <= rate) spool = target;
      else spool += Math.sign(target - spool) * rate;
    };
    rt.getState = () => ({ spool });
    rt.setState = (s) => {
      spool = s.spool ?? 0;
    };
    rt.readouts = (e) => [
      { key: 'command', label: 'Command', value: rt.inputs.command ?? 0, quantity: 'ratio' },
      { key: 'spool', label: 'Spool position', value: spool, quantity: 'ratio' },
      ...variant.ports.map((p) => ({ key: `p${p}`, label: `Port ${p}`, value: e.pressure(nodes[p]!), quantity: 'pressure' as const })),
    ];
    return rt;
  },
};

// ───────────────────────────── Check valves ─────────────────────────────
export const checkValveModel: ComponentModel = {
  type: 'check-valve',
  name: 'Check valve',
  category: 'valve',
  symbol: 'check',
  summary: 'Allows free flow in one direction once the cracking pressure is exceeded; blocks reverse flow.',
  ports: () => [
    port('IN', 'IN', 'Inlet', 'inline-in', 'Free-flow inlet (arrow on body points away from this port).'),
    port('OUT', 'OUT', 'Outlet', 'inline-out', 'Free-flow outlet.'),
  ],
  params: [
    { key: 'crack', label: 'Cracking pressure', quantity: 'none', min: 0.1, max: 10, default: 0.35, description: 'bar' },
    { key: 'ratedFlow', label: 'Rated flow', quantity: 'none', min: 5, max: 400, default: 80, description: 'L/min' },
  ],
  inputs: [],
  faultKinds: ['check-leak'],
  build(ctx, def) {
    const env = ctx.envRef;
    const rt = baseRuntime(def);
    const nIn = ctx.port(def, 'IN', 0.01e-3);
    const nOut = ctx.port(def, 'OUT', 0.01e-3);
    rt.portNodes = { IN: nIn, OUT: nOut };
    const crack = num(def, 'crack', 0.35) * BAR;
    const G = (num(def, 'ratedFlow', 80) * LPM) / (3 * BAR);
    rt.elements.push(
      branch(`${def.id}:poppet`, def.id, def.label, nIn, nOut, (a, b) => {
        const dp = a - b;
        let q = dp > crack ? G * (dp - crack) : 0;
        const leak = env.current.faults.severity(def.id, 'check-leak');
        q += (1e-14 + 3e-12 * leak) * dp;
        return q;
      }),
    );
    rt.getState = () => ({});
    rt.setState = () => {};
    rt.readouts = (e) => [{ key: 'dp', label: 'Δp', value: e.pressure(nIn) - e.pressure(nOut), quantity: 'pressure' }];
    return rt;
  },
};

/** Pilot-operated check / counterbalance / load-holding valve family. */
function loadHoldingBuild(kind: 'pilot-check' | 'counterbalance') {
  return (ctx: Parameters<ComponentModel['build']>[0], def: ComponentInstanceDefinition) => {
    const env = ctx.envRef;
    const rt = baseRuntime(def);
    const nV = ctx.port(def, 'V', 0.01e-3);
    const nL = ctx.port(def, 'L', 0.01e-3);
    const nX = ctx.port(def, 'X', 0.005e-3);
    rt.portNodes = { V: nV, L: nL, X: nX };
    const ratio = num(def, 'pilotRatio', kind === 'pilot-check' ? 3 : 4);
    rt.inputs = { setting: num(def, 'setting', 210) * BAR, manualBleed: 0 };
    const band = 6 * BAR;
    const area = areaFor(num(def, 'ratedFlow', 80) * LPM, 5 * BAR);
    const G = (num(def, 'ratedFlow', 80) * LPM) / (3 * BAR);
    let opening = 0;
    const sev = (k: string) => env.current.faults.severity(def.id, k);
    const open = (pL: number, pX: number) => {
      if (kind === 'pilot-check') return clamp((pX * ratio - pL) / band, 0, 1);
      return clamp((pL + ratio * pX - (rt.inputs.setting ?? 0)) / band, 0, 1);
    };
    rt.elements.push(
      element(`${def.id}:body`, def.id, def.label, [nV, nL, nX], (p, out) => {
        const pV = p[nV]!;
        const pL = p[nL]!;
        const pX = p[nX]!;
        // free flow V→L through integral check
        let q = pV - pL > 0.5 * BAR ? G * (pV - pL - 0.5 * BAR) : 0;
        // controlled reverse flow L→V
        // Manual bleed/override screw (service): opens the reverse path deliberately.
        const bleed = (rt.inputs.manualBleed ?? 0) > 0 ? 0.15 : 0;
        q -= orificeFlow(area * Math.max(open(pL, pX), bleed), pL - pV, env.current.fluid.rho);
        q += (1e-14 + 4e-12 * sev('load-valve-leak')) * (pV - pL);
        out[0] = -q;
        out[1] = q;
        out[2] = 0;
      }),
    );
    rt.postStep = (e) => {
      opening = open(e.pressure(nL), e.pressure(nX));
    };
    rt.getState = () => ({ setting: rt.inputs.setting ?? 0 });
    rt.setState = (s) => {
      if (typeof s.setting === 'number') rt.inputs.setting = s.setting;
    };
    rt.readouts = (e) => [
      ...(kind === 'counterbalance' ? [{ key: 'setting', label: 'Setting', value: rt.inputs.setting ?? 0, quantity: 'pressure' as const }] : []),
      { key: 'load', label: 'Load port', value: e.pressure(nL), quantity: 'pressure' },
      { key: 'pilot', label: 'Pilot', value: e.pressure(nX), quantity: 'pressure' },
      { key: 'opening', label: 'Reverse-flow opening', value: opening, quantity: 'ratio' },
    ];
    return rt;
  };
}

const lhPorts = () => [
  port('V', 'V', 'Valve side', 'work', 'Connects to the directional valve work port.'),
  port('L', 'C', 'Load (cylinder) side', 'work', 'Connects directly to the actuator port being held.'),
  port('X', 'X', 'Pilot', 'pilot', 'Pilot line – connect to the opposite actuator line.'),
];

export const pilotCheckModel: ComponentModel = {
  type: 'pilot-check',
  name: 'Pilot-operated check valve',
  category: 'valve',
  symbol: 'pilot-check',
  summary: 'Holds a load leak-tight until pilot pressure from the opposite line unseats the poppet.',
  ports: lhPorts,
  params: [
    { key: 'pilotRatio', label: 'Pilot ratio', quantity: 'ratio', min: 1.5, max: 10, default: 3 },
    { key: 'ratedFlow', label: 'Rated flow', quantity: 'none', min: 5, max: 300, default: 80, description: 'L/min' },
  ],
  inputs: [],
  faultKinds: ['load-valve-leak'],
  build: loadHoldingBuild('pilot-check'),
};

export const counterbalanceModel: ComponentModel = {
  type: 'counterbalance',
  name: 'Counterbalance valve',
  category: 'valve',
  symbol: 'counterbalance',
  summary: 'Pilot-assisted relief in the load line: prevents an overrunning load from running away and holds it in neutral.',
  ports: lhPorts,
  params: [
    { key: 'setting', label: 'Setting', quantity: 'none', min: 20, max: 350, default: 210, description: 'bar – typically 1.3× load-induced pressure', live: true },
    { key: 'pilotRatio', label: 'Pilot ratio', quantity: 'ratio', min: 1.5, max: 10, default: 4 },
    { key: 'ratedFlow', label: 'Rated flow', quantity: 'none', min: 5, max: 300, default: 80, description: 'L/min' },
  ],
  inputs: [{ key: 'setting', label: 'Setting', min: 20e5, max: 350e5, default: 210e5, quantity: 'pressure', step: 1e5 }],
  faultKinds: ['load-valve-leak'],
  build: loadHoldingBuild('counterbalance'),
};

// ───────────────────────────── Modulating valves ─────────────────────────────
export const pressureReducingModel: ComponentModel = {
  type: 'pressure-reducing',
  name: 'Pressure reducing valve',
  category: 'valve',
  symbol: 'reducing',
  summary: 'Normally open; senses its OUTLET and throttles to hold a lower, constant downstream pressure. Needs an external drain.',
  ports: () => [
    port('P', 'P', 'Inlet', 'supply', 'Upstream (higher) pressure.'),
    port('A', 'A', 'Reduced outlet', 'work', 'Regulated branch pressure.'),
    port('Y', 'Y', 'Spring chamber drain', 'drain', 'Drain to tank – a blocked drain makes the valve fail.'),
  ],
  params: [
    { key: 'setting', label: 'Reduced pressure', quantity: 'none', min: 5, max: 300, default: 60, description: 'bar', live: true },
    { key: 'ratedFlow', label: 'Rated flow', quantity: 'none', min: 5, max: 300, default: 60, description: 'L/min' },
  ],
  inputs: [{ key: 'setting', label: 'Setting', min: 5e5, max: 300e5, default: 60e5, quantity: 'pressure', step: 1e5 }],
  faultKinds: ['dcv-restricted'],
  build(ctx, def) {
    const env = ctx.envRef;
    const rt = baseRuntime(def);
    const nP = ctx.port(def, 'P', 0.01e-3);
    const nA = ctx.port(def, 'A', 0.01e-3);
    const nY = ctx.port(def, 'Y', 0.005e-3);
    rt.portNodes = { P: nP, A: nA, Y: nY };
    rt.inputs = { setting: num(def, 'setting', 60) * BAR };
    const area = areaFor(num(def, 'ratedFlow', 60) * LPM, 5 * BAR);
    const band = 4 * BAR;
    rt.elements.push(
      element(`${def.id}:spool`, def.id, def.label, [nP, nA, nY], (p, out) => {
        const pA = p[nA]!;
        const pY = p[nY]!;
        // Spring chamber referenced to drain: a pressurised drain raises the effective setting.
        const open = clamp(((rt.inputs.setting ?? 0) + pY - pA) / band, 0, 1);
        const q = orificeFlow(area * open, p[nP]! - pA, env.current.fluid.rho);
        const pilotDrain = 2e-13 * Math.max(0, pA - pY);
        out[0] = -q;
        out[1] = q - pilotDrain;
        out[2] = pilotDrain;
      }),
    );
    rt.getState = () => ({ setting: rt.inputs.setting ?? 0 });
    rt.setState = (s) => {
      if (typeof s.setting === 'number') rt.inputs.setting = s.setting;
    };
    rt.readouts = (e) => [
      { key: 'setting', label: 'Setting', value: rt.inputs.setting ?? 0, quantity: 'pressure' },
      { key: 'in', label: 'Inlet', value: e.pressure(nP), quantity: 'pressure' },
      { key: 'out', label: 'Reduced outlet', value: e.pressure(nA), quantity: 'pressure' },
    ];
    return rt;
  },
};

export const flowControlModel: ComponentModel = {
  type: 'flow-control',
  name: 'Flow control valve',
  category: 'valve',
  symbol: 'flow-control',
  summary: 'Needle (non-compensated) or pressure-compensated flow control. Meters flow to control actuator speed.',
  ports: () => [
    port('IN', 'IN', 'Inlet', 'inline-in', 'Controlled-flow inlet (arrow on body).'),
    port('OUT', 'OUT', 'Outlet', 'inline-out', 'Controlled-flow outlet.'),
  ],
  params: [
    { key: 'compensated', label: 'Pressure compensated', quantity: 'none', default: false },
    { key: 'maxArea', label: 'Max orifice area', quantity: 'none', min: 1, max: 300, default: 40, description: 'mm²' },
    { key: 'opening', label: 'Opening', quantity: 'ratio', min: 0, max: 1, default: 1, live: true },
    { key: 'setFlow', label: 'Compensated flow setting', quantity: 'none', min: 1, max: 200, default: 30, description: 'L/min', live: true },
  ],
  inputs: [
    { key: 'opening', label: 'Opening', min: 0, max: 1, default: 1, quantity: 'ratio', step: 0.01 },
    { key: 'setFlow', label: 'Set flow', min: 1 * LPM, max: 200 * LPM, default: 30 * LPM, quantity: 'flow', step: LPM },
  ],
  faultKinds: ['dcv-restricted'],
  build(ctx, def) {
    const env = ctx.envRef;
    const rt = baseRuntime(def);
    const nIn = ctx.port(def, 'IN', 0.01e-3);
    const nOut = ctx.port(def, 'OUT', 0.01e-3);
    rt.portNodes = { IN: nIn, OUT: nOut };
    rt.inputs = { opening: num(def, 'opening', 1), setFlow: num(def, 'setFlow', 30) * LPM };
    const maxArea = num(def, 'maxArea', 40) * MM2;
    const comp = def.params.compensated === true;
    const q = (a: number, b: number) => {
      const restricted = 1 - 0.9 * env.current.faults.severity(def.id, 'dcv-restricted');
      const orifice = orificeFlow(maxArea * clamp(rt.inputs.opening ?? 1, 0, 1) * restricted, a - b, env.current.fluid.rho);
      if (!comp) return orifice;
      // Compensator holds Δp across the metering orifice so flow ≈ set flow once Δp > ~8 bar.
      const set = rt.inputs.setFlow ?? 0;
      const lim = set * Math.tanh((a - b) / (8 * BAR));
      return Math.abs(orifice) < Math.abs(lim) ? orifice : lim;
    };
    let last = 0;
    rt.elements.push(branch(`${def.id}:orifice`, def.id, def.label, nIn, nOut, q));
    rt.postStep = (e) => {
      last = q(e.pressure(nIn), e.pressure(nOut));
    };
    rt.getState = () => ({ opening: rt.inputs.opening ?? 1, setFlow: rt.inputs.setFlow ?? 0 });
    rt.setState = (s) => {
      if (typeof s.opening === 'number') rt.inputs.opening = s.opening;
      if (typeof s.setFlow === 'number') rt.inputs.setFlow = s.setFlow;
    };
    rt.readouts = (e) => [
      { key: 'flow', label: 'Flow', value: last, quantity: 'flow' },
      { key: 'dp', label: 'Δp', value: e.pressure(nIn) - e.pressure(nOut), quantity: 'pressure' },
    ];
    return rt;
  },
};

export const unloadingValveModel: ComponentModel = {
  type: 'unloading-valve',
  name: 'Unloading valve',
  category: 'valve',
  symbol: 'unloading',
  summary: 'Externally piloted: dumps pump flow to tank at low pressure once a remote pilot signal (e.g. accumulator) reaches the setting.',
  ports: () => [
    port('P', 'P', 'Inlet', 'supply', 'Pump flow to be unloaded.'),
    port('T', 'T', 'Tank', 'tank', 'Return to tank.'),
    port('X', 'X', 'Remote pilot', 'pilot', 'Pilot signal from the circuit being charged.'),
  ],
  params: [
    { key: 'setting', label: 'Unload pressure', quantity: 'none', min: 10, max: 300, default: 140, description: 'bar', live: true },
    { key: 'ratedFlow', label: 'Rated flow', quantity: 'none', min: 5, max: 300, default: 80, description: 'L/min' },
  ],
  inputs: [{ key: 'setting', label: 'Setting', min: 10e5, max: 300e5, default: 140e5, quantity: 'pressure', step: 1e5 }],
  faultKinds: ['relief-stuck-open'],
  build(ctx, def) {
    const env = ctx.envRef;
    const rt = baseRuntime(def);
    const nP = ctx.port(def, 'P', 0.01e-3);
    const nT = ctx.port(def, 'T', 0.01e-3);
    const nX = ctx.port(def, 'X', 0.005e-3);
    rt.portNodes = { P: nP, T: nT, X: nX };
    rt.inputs = { setting: num(def, 'setting', 140) * BAR };
    const area = areaFor(num(def, 'ratedFlow', 80) * LPM, 3 * BAR);
    rt.elements.push(
      element(`${def.id}:spool`, def.id, def.label, [nP, nT, nX], (p, out) => {
        const stuck = env.current.faults.severity(def.id, 'relief-stuck-open');
        const open = Math.max(stuck, clamp((p[nX]! - (rt.inputs.setting ?? 0)) / (5 * BAR), 0, 1));
        const q = orificeFlow(area * open, p[nP]! - p[nT]!, env.current.fluid.rho) + 1e-14 * (p[nP]! - p[nT]!);
        out[0] = -q;
        out[1] = q;
        out[2] = 0;
      }),
    );
    rt.getState = () => ({ setting: rt.inputs.setting ?? 0 });
    rt.setState = (s) => {
      if (typeof s.setting === 'number') rt.inputs.setting = s.setting;
    };
    rt.readouts = (e) => [
      { key: 'pilot', label: 'Pilot', value: e.pressure(nX), quantity: 'pressure' },
      { key: 'unloaded', label: 'Unloaded', value: e.pressure(nX) > (rt.inputs.setting ?? 0) },
    ];
    return rt;
  },
};

export const priorityValveModel: ComponentModel = {
  type: 'priority-valve',
  name: 'Priority flow divider',
  category: 'valve',
  symbol: 'priority',
  summary: 'Satisfies the priority (CF) circuit first – e.g. steering – and sends the excess to the EF circuit.',
  ports: () => [
    port('P', 'P', 'Inlet', 'supply', 'Pump supply.'),
    port('CF', 'CF', 'Controlled (priority) flow', 'work', 'Priority circuit.'),
    port('EF', 'EF', 'Excess flow', 'work', 'Secondary circuit – may be routed to tank.'),
  ],
  params: [
    { key: 'priorityFlow', label: 'Priority flow', quantity: 'none', min: 2, max: 120, default: 20, description: 'L/min' },
    { key: 'ratedFlow', label: 'Rated flow', quantity: 'none', min: 10, max: 300, default: 100, description: 'L/min' },
  ],
  inputs: [],
  faultKinds: ['spool-stuck'],
  build(ctx, def) {
    const env = ctx.envRef;
    const rt = baseRuntime(def);
    const nP = ctx.port(def, 'P', 0.01e-3);
    const nC = ctx.port(def, 'CF', 0.01e-3);
    const nE = ctx.port(def, 'EF', 0.01e-3);
    rt.portNodes = { P: nP, CF: nC, EF: nE };
    const spring = 7 * BAR;
    const cfArea = areaFor(num(def, 'priorityFlow', 20) * LPM, spring);
    const efArea = areaFor(num(def, 'ratedFlow', 100) * LPM, 4 * BAR);
    rt.elements.push(
      element(`${def.id}:spool`, def.id, def.label, [nP, nC, nE], (p, out) => {
        const rho = env.current.fluid.rho;
        const dpC = p[nP]! - p[nC]!;
        const qc = orificeFlow(cfArea, dpC, rho);
        const stuck = env.current.faults.severity(def.id, 'spool-stuck') > 0.5;
        const open = stuck ? 0 : clamp((dpC - spring) / (2 * BAR), 0, 1);
        const qe = orificeFlow(efArea * open, p[nP]! - p[nE]!, rho);
        out[0] = -(qc + qe);
        out[1] = qc;
        out[2] = qe;
      }),
    );
    rt.getState = () => ({});
    rt.setState = () => {};
    rt.readouts = (e) => [
      { key: 'p', label: 'Inlet', value: e.pressure(nP), quantity: 'pressure' },
      { key: 'cf', label: 'CF', value: e.pressure(nC), quantity: 'pressure' },
    ];
    return rt;
  },
};

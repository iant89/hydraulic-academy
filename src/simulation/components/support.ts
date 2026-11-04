import { BAR, G, LITRE, LPM, MM, ATM_ABS, circleArea, clamp } from '../core/units';
import { orificeFlow } from '../physics/flow';
import type { StepEnv } from '../hydraulics/types';
import { type ComponentModel, baseRuntime, branch, element, num, port } from './base';

/**
 * Reservoir. Ports are fixed-pressure boundaries: the suction outlet sees
 * the static head of the oil column above it; return/drain inlets are at
 * ~0 bar gauge. Volume is integrated from net flows. When the level falls
 * close to the suction pickup a vortex draws air into the suction line.
 */
export const reservoirModel: ComponentModel = {
  type: 'reservoir',
  name: 'Reservoir (tank)',
  category: 'storage',
  symbol: 'reservoir',
  summary: 'Stores fluid, lets air and contaminants settle out, and dissipates heat. Supplies the pump inlet.',
  ports: () => [
    port('S', 'S', 'Suction outlet', 'suction-out', 'Pump supply – the only port that should feed a pump inlet.'),
    port('R', 'R', 'Return inlet', 'return-in', 'Return line – terminates below the fluid level through a diffuser.'),
    port('D', 'D', 'Drain inlet', 'drain-in', 'Case drain / pilot drain inlet – low pressure, unrestricted.'),
  ],
  params: [
    { key: 'capacity', label: 'Capacity', quantity: 'none', min: 1, max: 2000, default: 120, description: 'L' },
    { key: 'initialVolume', label: 'Fluid volume', quantity: 'none', min: 0, max: 2000, default: 100, description: 'L', live: true },
    { key: 'height', label: 'Tank height', quantity: 'length', min: 0.1, max: 2, default: 0.5 },
    { key: 'pickupHeight', label: 'Suction pickup height', quantity: 'length', min: 0, max: 0.5, default: 0.06 },
    { key: 'minLevelMark', label: 'Sight-glass MIN mark (fraction of height)', quantity: 'ratio', min: 0, max: 1, default: 0.55 },
  ],
  inputs: [],
  faultKinds: ['reservoir-breather-blocked'],
  build(ctx, def) {
    const env = ctx.envRef;
    const rt = baseRuntime(def);
    const capacity = num(def, 'capacity', 120) * LITRE;
    const height = num(def, 'height', 0.5);
    const area = capacity / height;
    const pickup = num(def, 'pickupHeight', 0.06);
    const minMark = num(def, 'minLevelMark', 0.55);
    let volume = clamp(num(def, 'initialVolume', 100) * LITRE, 0, capacity);
    const level = () => volume / area;
    const breather = () => -0.25 * BAR * env.current.faults.severity(def.id, 'reservoir-breather-blocked');
    const nS = ctx.boundary(def.id, `${def.label} S`, () => env.current.fluid.rho * G * level() + breather(), 'tank');
    const nR = ctx.boundary(def.id, `${def.label} R`, () => breather(), 'tank');
    const nD = ctx.boundary(def.id, `${def.label} D`, () => breather(), 'tank');
    rt.portNodes = { S: nS, R: nR, D: nD };
    // A boundary node needs at least one element; ports are linked through the tank volume itself.
    let uncovered = false;
    rt.postStep = (e: StepEnv) => {
      const net = e.inflow(nS) + e.inflow(nR) + e.inflow(nD);
      volume = clamp(volume + net * e.dt, 0, capacity);
      const lv = level();
      const prev = uncovered;
      uncovered = lv < pickup + 0.03;
      if (uncovered) {
        const vortex = clamp((pickup + 0.03 - lv) / 0.03, 0, 1);
        const draw = Math.max(0, -e.inflow(nS));
        e.fluidState.airFraction = clamp(e.fluidState.airFraction + vortex * (draw / (0.02 + volume)) * 0.6 * e.dt, 0, 0.3);
      }
      if (uncovered && !prev) e.log({ level: 'alarm', source: def.id, code: 'reservoir-low', message: 'Fluid level at suction pickup – pump is drawing air.' });
    };
    rt.getState = () => ({ volume });
    rt.setState = (s) => {
      if (typeof s.volume === 'number') volume = clamp(s.volume, 0, capacity);
    };
    rt.readouts = () => [
      { key: 'volume', label: 'Fluid volume', value: volume, quantity: 'volume' },
      { key: 'level', label: 'Level (fraction of height)', value: level() / height, quantity: 'ratio' },
      { key: 'belowMin', label: 'Below MIN mark', value: level() / height < minMark },
      { key: 'pickupUncovered', label: 'Pickup uncovered', value: uncovered },
      { key: 'capacity', label: 'Capacity', value: capacity, quantity: 'volume' },
    ];
    return rt;
  },
};

export const filterModel: ComponentModel = {
  type: 'filter',
  name: 'Hydraulic filter with bypass',
  category: 'conditioning',
  symbol: 'filter',
  summary: 'Removes particles. A clogged element raises Δp until the bypass valve opens and unfiltered oil circulates.',
  ports: () => [
    port('IN', 'IN', 'Inlet', 'inline-in', 'Unfiltered side (arrow on head).'),
    port('OUT', 'OUT', 'Outlet', 'inline-out', 'Filtered side.'),
  ],
  params: [
    { key: 'cleanDp', label: 'Clean Δp at rated flow', quantity: 'none', min: 0.05, max: 3, default: 0.3, description: 'bar' },
    { key: 'ratedFlow', label: 'Rated flow', quantity: 'none', min: 5, max: 500, default: 100, description: 'L/min' },
    { key: 'bypass', label: 'Bypass valve setting', quantity: 'none', min: 0.5, max: 7, default: 1.7, description: 'bar' },
    { key: 'micron', label: 'Rating', quantity: 'none', min: 3, max: 150, default: 10, description: 'µm (β ≥ 200)' },
    { key: 'initialClog', label: 'Element loading', quantity: 'ratio', min: 0, max: 0.99, default: 0.05 },
  ],
  inputs: [],
  faultKinds: ['filter-clogged'],
  build(ctx, def) {
    const env = ctx.envRef;
    const rt = baseRuntime(def);
    const nIn = ctx.port(def, 'IN', 0.3e-3);
    const nOut = ctx.port(def, 'OUT', 0.05e-3);
    rt.portNodes = { IN: nIn, OUT: nOut };
    const R0 = (num(def, 'cleanDp', 0.3) * BAR) / (num(def, 'ratedFlow', 100) * LPM);
    const bypass = num(def, 'bypass', 1.7) * BAR;
    const Gb = (num(def, 'ratedFlow', 100) * LPM) / (1.0 * BAR);
    let clog = num(def, 'initialClog', 0.05);
    let lastElem = 0;
    let lastBypass = 0;
    const effClog = () => Math.max(clog, 0.985 * env.current.faults.severity(def.id, 'filter-clogged'));
    const R = () => (R0 * (env.current.fluid.mu / env.current.fluid.muRef)) / Math.pow(1 - 0.97 * effClog(), 2);
    const elemQ = (dp: number) => dp / R();
    const bypassQ = (dp: number) => (dp > bypass ? Gb * (dp - bypass) : 0);
    rt.elements.push(branch(`${def.id}:element`, def.id, `${def.label} element`, nIn, nOut, (a, b) => elemQ(a - b) + bypassQ(a - b)));
    rt.postStep = (e) => {
      const dp = e.pressure(nIn) - e.pressure(nOut);
      lastElem = elemQ(dp);
      lastBypass = bypassQ(dp);
      const fs = e.fluidState;
      const dirt = Math.pow(2, (fs.contamination - 16) / 2);
      clog = clamp(clog + 2e-6 * dirt * (Math.abs(lastElem) / LPM / 60) * e.dt, 0, 0.99);
      // Filtration cleans the fluid towards the cleanliness the element can achieve.
      const target = 14.5;
      if (fs.contamination > target) fs.contamination -= (Math.abs(lastElem) / 0.15) * 0.25 * (fs.contamination - target) * e.dt;
    };
    rt.getState = () => ({ clog });
    rt.setState = (s) => {
      if (typeof s.clog === 'number') clog = s.clog;
    };
    rt.readouts = (e) => [
      { key: 'dp', label: 'Δp across filter', value: e.pressure(nIn) - e.pressure(nOut), quantity: 'pressure' },
      { key: 'clog', label: 'Element loading', value: effClog(), quantity: 'ratio' },
      { key: 'bypassing', label: 'Bypass indicator', value: lastBypass > 0.2 * LPM },
      { key: 'bypassFlow', label: 'Bypass flow', value: lastBypass, quantity: 'flow' },
    ];
    return rt;
  },
};

export const coolerModel: ComponentModel = {
  type: 'cooler',
  name: 'Oil cooler (air-blast)',
  category: 'conditioning',
  symbol: 'cooler',
  summary: 'Rejects heat generated by system losses. Usually in the return line, protected by a bypass check.',
  ports: () => [
    port('IN', 'IN', 'Oil inlet', 'inline-in', 'Hot oil in.'),
    port('OUT', 'OUT', 'Oil outlet', 'inline-out', 'Cooled oil out.'),
  ],
  params: [
    { key: 'dpRated', label: 'Δp at rated flow', quantity: 'none', min: 0.05, max: 3, default: 0.5, description: 'bar' },
    { key: 'ratedFlow', label: 'Rated flow', quantity: 'none', min: 5, max: 400, default: 100, description: 'L/min' },
    { key: 'ua', label: 'Heat rejection (UA)', quantity: 'none', min: 10, max: 2000, default: 260, description: 'W/K' },
  ],
  inputs: [],
  faultKinds: ['cooler-blocked', 'dcv-restricted'],
  build(ctx, def) {
    const env = ctx.envRef;
    const rt = baseRuntime(def);
    const nIn = ctx.port(def, 'IN', 1.5e-3);
    const nOut = ctx.port(def, 'OUT', 0.1e-3);
    rt.portNodes = { IN: nIn, OUT: nOut };
    const R0 = (num(def, 'dpRated', 0.5) * BAR) / (num(def, 'ratedFlow', 100) * LPM);
    const rated = num(def, 'ratedFlow', 100) * LPM;
    const ua = num(def, 'ua', 260);
    let q = 0;
    const R = () => (R0 * (env.current.fluid.mu / env.current.fluid.muRef)) * (1 + 15 * env.current.faults.severity(def.id, 'dcv-restricted'));
    rt.elements.push(branch(`${def.id}:core`, def.id, `${def.label} core`, nIn, nOut, (a, b) => (a - b) / R()));
    rt.postStep = (e) => {
      q = (e.pressure(nIn) - e.pressure(nOut)) / R();
    };
    rt.heatRejection = (e) => {
      const blocked = 1 - 0.85 * e.faults.severity(def.id, 'cooler-blocked');
      const flowFactor = Math.pow(clamp(Math.abs(q) / rated, 0, 1.5), 0.6);
      return ua * blocked * flowFactor * (e.fluidState.temperature - e.ambient);
    };
    rt.getState = () => ({});
    rt.setState = () => {};
    rt.readouts = (e) => [
      { key: 'dp', label: 'Δp', value: e.pressure(nIn) - e.pressure(nOut), quantity: 'pressure' },
      { key: 'heat', label: 'Heat rejected', value: rt.heatRejection!(e), quantity: 'power' },
    ];
    return rt;
  },
};

export const accumulatorModel: ComponentModel = {
  type: 'accumulator',
  name: 'Bladder accumulator',
  category: 'storage',
  symbol: 'accumulator',
  summary: 'Stores fluid under gas (nitrogen) pressure. STORED ENERGY HAZARD – remains pressurised after shutdown.',
  ports: () => [port('P', 'P', 'Fluid port', 'work', 'Connect to the circuit. Fit a bleed-down valve.')],
  params: [
    { key: 'volume', label: 'Gas volume', quantity: 'none', min: 0.1, max: 50, default: 4, description: 'L' },
    { key: 'precharge', label: 'Nitrogen precharge', quantity: 'none', min: 5, max: 250, default: 90, description: 'bar' },
  ],
  inputs: [],
  faultKinds: ['accumulator-precharge-loss'],
  build(ctx, def) {
    const env = ctx.envRef;
    const rt = baseRuntime(def);
    const nP = ctx.port(def, 'P', 0.01e-3);
    rt.portNodes = { P: nP };
    const V0 = num(def, 'volume', 4) * LITRE;
    const p0 = () => (num(def, 'precharge', 90) * BAR * (1 - 0.9 * env.current.faults.severity(def.id, 'accumulator-precharge-loss'))) + ATM_ABS;
    // Isothermal gas law – adequate for slow charge/discharge.
    const fluidVol = (pg: number) => {
      const pa = pg + ATM_ABS;
      return pa > p0() ? V0 * (1 - p0() / pa) : 0;
    };
    let vf = 0;
    rt.elements.push(
      element(`${def.id}:gas`, def.id, `${def.label} gas spring`, [nP], (p, out) => {
        out[0] = -(fluidVol(p[nP]!) - vf) / env.current.dt;
      }, false),
    );
    rt.postStep = (e) => {
      vf = fluidVol(e.pressure(nP));
    };
    rt.getState = () => ({ vf });
    rt.setState = (s) => {
      vf = s.vf ?? 0;
    };
    rt.readouts = (e) => [
      { key: 'pressure', label: 'Pressure', value: e.pressure(nP), quantity: 'pressure' },
      { key: 'stored', label: 'Stored fluid', value: vf, quantity: 'volume' },
      { key: 'precharge', label: 'Precharge', value: p0() - ATM_ABS, quantity: 'pressure' },
    ];
    return rt;
  },
};

export const orificeModel: ComponentModel = {
  type: 'orifice',
  name: 'Fixed restriction (orifice)',
  category: 'valve',
  symbol: 'orifice',
  summary: 'A fixed restriction: Δp rises with the square of flow. Used to demonstrate pressure drop.',
  ports: () => [port('IN', '1', 'Port 1', 'inline-in', 'Either direction.'), port('OUT', '2', 'Port 2', 'inline-out', 'Either direction.')],
  params: [{ key: 'diameter', label: 'Orifice diameter', quantity: 'none', min: 0.3, max: 30, default: 4, description: 'mm', live: true }],
  inputs: [{ key: 'diameter', label: 'Diameter (mm)', min: 0.3, max: 30, default: 4, quantity: 'none', step: 0.1 }],
  faultKinds: [],
  build(ctx, def) {
    const env = ctx.envRef;
    const rt = baseRuntime(def);
    const a = ctx.port(def, 'IN', 0.01e-3);
    const b = ctx.port(def, 'OUT', 0.01e-3);
    rt.portNodes = { IN: a, OUT: b };
    rt.inputs = { diameter: num(def, 'diameter', 4) };
    rt.elements.push(branch(`${def.id}:orifice`, def.id, def.label, a, b, (pa, pb) => orificeFlow(circleArea((rt.inputs.diameter ?? 4) * MM), pa - pb, env.current.fluid.rho)));
    rt.getState = () => ({ diameter: rt.inputs.diameter ?? 4 });
    rt.setState = (s) => {
      if (typeof s.diameter === 'number') rt.inputs.diameter = s.diameter;
    };
    rt.readouts = (e) => [{ key: 'dp', label: 'Δp', value: e.pressure(a) - e.pressure(b), quantity: 'pressure' }];
    return rt;
  },
};

// ───────────────────────────── Instruments ─────────────────────────────
export const gaugeModel: ComponentModel = {
  type: 'gauge',
  name: 'Pressure gauge / test point',
  category: 'instrument',
  symbol: 'gauge',
  summary: 'Reads static gauge pressure at the point where it is installed (via a test coupling).',
  ports: () => [port('G', 'G', 'Gauge connection', 'gauge', 'Test coupling – connect to the point to be measured.')],
  params: [{ key: 'range', label: 'Full-scale range', quantity: 'none', min: 1, max: 700, default: 250, description: 'bar' }],
  inputs: [],
  faultKinds: [],
  build(ctx, def) {
    const rt = baseRuntime(def);
    const n = ctx.port(def, 'G', 0.002e-3);
    rt.portNodes = { G: n };
    rt.getState = () => ({});
    rt.setState = () => {};
    rt.readouts = (e) => [{ key: 'pressure', label: 'Pressure', value: e.pressure(n), quantity: 'pressure' }];
    return rt;
  },
};

export const flowMeterModel: ComponentModel = {
  type: 'flow-meter',
  name: 'In-line flow meter / tester with load valve',
  category: 'instrument',
  symbol: 'flow-meter',
  summary: 'Turbine flow meter with an integral loading valve – used to test pump flow at a controlled pressure.',
  ports: () => [port('IN', 'IN', 'Inlet', 'inline-in', 'Flow arrow on tester body.'), port('OUT', 'OUT', 'Outlet', 'inline-out', 'Outlet.')],
  params: [{ key: 'load', label: 'Load valve closure', quantity: 'ratio', min: 0, max: 1, default: 0, live: true }],
  inputs: [{ key: 'load', label: 'Load valve closure', min: 0, max: 1, default: 0, quantity: 'ratio', step: 0.01 }],
  faultKinds: [],
  build(ctx, def) {
    const env = ctx.envRef;
    const rt = baseRuntime(def);
    const a = ctx.port(def, 'IN', 0.05e-3);
    const b = ctx.port(def, 'OUT', 0.05e-3);
    rt.portNodes = { IN: a, OUT: b };
    rt.inputs = { load: num(def, 'load', 0) };
    const full = circleArea(20 * MM);
    let q = 0;
    const flow = (pa: number, pb: number) => {
      const closure = clamp(rt.inputs.load ?? 0, 0, 1);
      const area = full * Math.pow(1 - closure, 2) + 0.05e-6;
      return orificeFlow(area, pa - pb, env.current.fluid.rho);
    };
    rt.elements.push(branch(`${def.id}:meter`, def.id, def.label, a, b, flow));
    rt.postStep = (e) => {
      q = flow(e.pressure(a), e.pressure(b));
    };
    rt.getState = () => ({ load: rt.inputs.load ?? 0 });
    rt.setState = (s) => {
      if (typeof s.load === 'number') rt.inputs.load = s.load;
    };
    rt.readouts = (e) => [
      { key: 'flow', label: 'Flow', value: q, quantity: 'flow' },
      { key: 'pressure', label: 'Tester inlet pressure', value: e.pressure(a), quantity: 'pressure' },
      { key: 'temperature', label: 'Fluid temperature', value: e.fluidState.temperature, quantity: 'temperature' },
    ];
    return rt;
  },
};

export const tempSensorModel: ComponentModel = {
  type: 'temp-sensor',
  name: 'Temperature sensor',
  category: 'instrument',
  symbol: 'thermometer',
  summary: 'Reads bulk fluid temperature.',
  ports: () => [port('G', 'T', 'Sensor port', 'gauge', 'Install in a return line or reservoir.')],
  params: [],
  inputs: [],
  faultKinds: [],
  build(ctx, def) {
    const rt = baseRuntime(def);
    const n = ctx.port(def, 'G', 0.002e-3);
    rt.portNodes = { G: n };
    rt.getState = () => ({});
    rt.setState = () => {};
    rt.readouts = (e) => [{ key: 'temperature', label: 'Temperature', value: e.fluidState.temperature, quantity: 'temperature' }];
    return rt;
  },
};

/**
 * Open (disconnected) port. Created by the workshop when a line is
 * disconnected. Uncapped, the port discharges to atmosphere through the
 * port bore; capped, it is sealed.
 */
export const openPortModel: ComponentModel = {
  type: 'open-port',
  name: 'Open / capped port',
  category: 'instrument',
  symbol: 'plug',
  summary: 'A disconnected port. Always cap and plug open lines to prevent fluid loss and contamination.',
  ports: () => [],
  params: [
    { key: 'at', label: 'Port (component.port)', quantity: 'none', default: '' },
    { key: 'bore', label: 'Port bore', quantity: 'none', default: 12, description: 'mm' },
    { key: 'capped', label: 'Capped', quantity: 'none', default: true },
  ],
  inputs: [],
  faultKinds: [],
  build(ctx, def) {
    const env = ctx.envRef;
    const rt = baseRuntime(def);
    const [comp, portId] = String(def.params.at ?? '').split('.');
    const node = ctx.port({ ...def, id: comp ?? '' }, portId ?? '', 0);
    const area = circleArea(num(def, 'bore', 12) * MM);
    const capped = def.params.capped !== false;
    rt.elements.push(
      branch(`${def.id}:open`, def.id, `Open port ${def.params.at}`, node, ctx.atmosphere(), (pa) => (capped ? 0 : orificeFlow(area, pa, env.current.fluid.rho) + 1e-9 * pa), true, true),
    );
    rt.portNodes = {};
    rt.getState = () => ({});
    rt.setState = () => {};
    rt.readouts = () => [{ key: 'capped', label: 'Capped', value: capped }];
    return rt;
  },
};

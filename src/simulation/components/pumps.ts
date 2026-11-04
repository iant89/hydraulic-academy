import { ATM_ABS, CC, BAR, clamp } from '../core/units';
import { pumpTorque } from '../physics/formulas';
import type { ComponentInstanceDefinition, RuntimeComponent, StepEnv } from '../hydraulics/types';
import { type BuildCtx, type ComponentModel, baseRuntime, branch, element, num, port, str, smoothstep } from './base';

/**
 * Inlet fill model: a positive-displacement pump can only deliver what fills
 * its inlet chambers. Below ≈0.8 bar absolute at the inlet, vapour/air
 * release begins (cavitation) and effective fill falls steeply towards zero
 * near vapour pressure. Entrained air reduces fill proportionally.
 */
export function inletFill(pInletGauge: number, airFraction: number): number {
  const pAbs = pInletGauge + ATM_ABS;
  // Monotonic over the whole solver range (≥ −0.99 bar g) so Newton always has a gradient.
  const x = (pAbs - 0.005e5) / 0.795e5;
  const cav = x >= 1 ? 1 : x <= 0 ? 0 : 0.85 * smoothstep(x) + 0.15 * x;
  const air = 1 - Math.min(0.6, airFraction * 3);
  return cav * air;
}

interface PumpRuntime extends RuntimeComponent {
  lastFlow: number;
  lastFill: number;
}

function pumpBuild(ctx: BuildCtx, def: ComponentInstanceDefinition, variable: boolean): RuntimeComponent {
  const env = ctx.envRef;
  const Vd = num(def, 'displacement', 50) * CC;
  const ratedSpeed = num(def, 'ratedSpeed', 2000);
  const volEff = num(def, 'volumetricEfficiency', 0.93);
  const mechEff = num(def, 'mechanicalEfficiency', 0.88);
  const testP = num(def, 'testPressure', 170) * BAR;
  const rotation = str(def, 'rotation', 'cw');
  const compSetting = num(def, 'compensatorSetting', 200) * BAR;
  const compBand = 8 * BAR;
  // Leakage conductance at reference viscosity, derived from rated volumetric efficiency.
  const qThRated = Vd * (ratedSpeed / 60);
  const G0 = ((1 - volEff) * qThRated) / testP;

  const rt = baseRuntime(def) as PumpRuntime;
  rt.inputs = { speed: num(def, 'speed', 0), driveRotation: rotation === 'cw' ? 1 : -1 };
  rt.lastFlow = 0;
  rt.lastFill = 1;
  const nIn = ctx.port(def, 'IN', 0.05e-3);
  const nOut = ctx.port(def, 'OUT', 0.05e-3);
  rt.portNodes = { IN: nIn, OUT: nOut };
  let nCd = -1;
  if (variable) {
    nCd = ctx.port(def, 'CD', 0.05e-3);
    rt.portNodes.CD = nCd;
  }

  const sev = (k: string) => env.current.faults.severity(def.id, k);
  const effSpeed = () => {
    const e = env.current;
    if (sev('pump-shaft-sheared') > 0.5) return 0;
    const dir = rotation === 'cw' ? 1 : -1;
    const drive = rt.inputs.driveRotation ?? dir;
    const s = rt.inputs.speed ?? 0;
    void e;
    return drive === dir ? s : -s;
  };
  const leakG = () => {
    const e = env.current;
    const wear = sev('pump-wear');
    const gears = sev('pump-gear-damage');
    return G0 * (1 + 22 * wear + 30 * gears) * (e.fluid.muRef / e.fluid.mu);
  };
  const dispFrac = (pOut: number) => (variable ? clamp((compSetting + compBand - pOut) / compBand, 0.03, 1) : 1);

  const flowAt = (pIn: number, pOut: number) => {
    const e = env.current;
    const n = effSpeed();
    const fill = inletFill(pIn, e.fluidState.airFraction);
    const q = Vd * dispFrac(pOut) * (n / 60) * (n >= 0 ? fill : 1);
    return q;
  };

  if (variable) {
    rt.elements.push(
      element(`${def.id}:pump`, def.id, `${def.label} displacement`, [nIn, nOut, nCd], (p, out) => {
        const pIn = p[nIn]!;
        const pOut = p[nOut]!;
        const q = flowAt(pIn, pOut);
        const leak = leakG() * (pOut - p[nCd]!);
        out[0] = -q;
        out[1] = q - leak;
        out[2] = leak;
      }, false),
    );
  } else {
    rt.elements.push(
      branch(`${def.id}:pump`, def.id, `${def.label} displacement`, nIn, nOut, (pIn, pOut) => {
        return flowAt(pIn, pOut) - leakG() * (pOut - pIn);
      }, false),
    );
  }

  rt.postStep = (e: StepEnv) => {
    const pIn = e.pressure(nIn);
    const pOut = e.pressure(nOut);
    rt.lastFill = inletFill(pIn, e.fluidState.airFraction);
    // Damaged gears and prolonged cavitation shed wear debris into the fluid.
    const n = Math.abs(effSpeed());
    if (n > 1) {
      const shed = sev('pump-gear-damage') * 0.004 + (rt.lastFill < 0.9 ? (1 - rt.lastFill) * 0.002 : 0);
      e.fluidState.wearDebris = Math.min(1, e.fluidState.wearDebris + shed * e.dt);
      if (shed > 0) e.fluidState.contamination = Math.min(24, e.fluidState.contamination + shed * 0.5 * e.dt);
    }
    rt.lastFlow = flowAt(pIn, pOut) - leakG() * (pOut - (variable ? e.pressure(nCd) : pIn));
  };
  rt.extraHeat = (e: StepEnv) => {
    const pIn = e.pressure(nIn);
    const pOut = e.pressure(nOut);
    const dp = Math.max(0, pOut - pIn);
    const n = Math.abs(effSpeed());
    const shaft = (Vd * dispFrac(pOut) * dp * (n / 60)) / mechEff;
    const mechLoss = shaft * (1 - mechEff);
    const leak = leakG() * dp * dp;
    return mechLoss + leak;
  };
  rt.getState = () => ({});
  rt.setState = () => {};
  rt.readouts = (e: StepEnv) => {
    const pIn = e.pressure(nIn);
    const pOut = e.pressure(nOut);
    const n = effSpeed();
    const qTh = Vd * dispFrac(pOut) * (Math.abs(n) / 60);
    const torque = pumpTorque(Vd * dispFrac(pOut), Math.max(0, pOut - pIn), mechEff);
    const cav = rt.lastFill < 0.97 && Math.abs(n) > 1;
    return [
      { key: 'speed', label: 'Shaft speed', value: n, quantity: 'rpm' },
      { key: 'inlet', label: 'Inlet pressure', value: pIn, quantity: 'pressure' },
      { key: 'outlet', label: 'Outlet pressure', value: pOut, quantity: 'pressure' },
      { key: 'qth', label: 'Theoretical flow', value: qTh, quantity: 'flow' },
      { key: 'flow', label: 'Delivered flow', value: rt.lastFlow, quantity: 'flow' },
      { key: 'volEff', label: 'Volumetric efficiency', value: qTh > 1e-9 ? clamp(rt.lastFlow / qTh, 0, 1) : 0, quantity: 'ratio' },
      { key: 'torque', label: 'Drive torque', value: torque, quantity: 'torque' },
      { key: 'fill', label: 'Inlet fill', value: rt.lastFill, quantity: 'ratio' },
      { key: 'cavitating', label: 'Cavitating', value: cav },
      ...(variable ? [{ key: 'displacementFraction', label: 'Swash angle', value: dispFrac(pOut), quantity: 'ratio' as const }] : []),
    ];
  };
  return rt;
}

const commonPumpParams: ComponentModel['params'] = [
  { key: 'displacement', label: 'Displacement', quantity: 'none', min: 1, max: 250, default: 50, step: 1, description: 'cm³/rev' },
  { key: 'ratedSpeed', label: 'Rated speed', quantity: 'rpm', min: 300, max: 3600, default: 2000 },
  { key: 'speed', label: 'Drive speed (stand-alone)', quantity: 'rpm', min: 0, max: 3600, default: 1500, live: true },
  { key: 'volumetricEfficiency', label: 'Vol. efficiency at test pressure', quantity: 'ratio', min: 0.5, max: 0.99, default: 0.93, step: 0.01 },
  { key: 'mechanicalEfficiency', label: 'Mech. efficiency', quantity: 'ratio', min: 0.5, max: 0.99, default: 0.88, step: 0.01 },
  { key: 'testPressure', label: 'Efficiency test pressure', quantity: 'none', min: 50, max: 350, default: 170, description: 'bar' },
  { key: 'maxPressure', label: 'Max continuous pressure', quantity: 'none', min: 50, max: 420, default: 207, description: 'bar' },
  {
    key: 'rotation',
    label: 'Rotation (viewed from shaft end)',
    quantity: 'none',
    default: 'cw',
    options: [
      { value: 'cw', label: 'Clockwise' },
      { value: 'ccw', label: 'Counter-clockwise' },
    ],
  },
];

const pumpPorts = () => [
  port('IN', 'S', 'Suction inlet', 'pump-inlet', 'Large-bore inlet – connect to reservoir suction outlet only.'),
  port('OUT', 'P', 'Pressure outlet', 'pump-outlet', 'Pressure outlet – supplies the valve P port.'),
];

export const gearPumpModel: ComponentModel = {
  type: 'pump-gear',
  name: 'Fixed displacement gear pump',
  category: 'pump',
  symbol: 'pump-fixed',
  summary: 'External gear pump: flow proportional to shaft speed; pressure is set by load resistance.',
  ports: pumpPorts,
  params: commonPumpParams,
  inputs: [{ key: 'speed', label: 'Shaft speed', min: 0, max: 3600, default: 1500, quantity: 'rpm', step: 10 }],
  faultKinds: ['pump-wear', 'pump-gear-damage', 'pump-shaft-sheared'],
  build: (ctx, def) => pumpBuild(ctx, def, false),
};

export const vanePumpModel: ComponentModel = {
  ...gearPumpModel,
  type: 'pump-vane',
  name: 'Fixed displacement vane pump',
  summary: 'Balanced vane pump: quieter than gear pumps; vanes and cam ring wear increases slip.',
  faultKinds: ['pump-wear', 'pump-shaft-sheared'],
};

export const pistonPumpModel: ComponentModel = {
  type: 'pump-piston-pc',
  name: 'Variable displacement axial piston pump (pressure compensated)',
  category: 'pump',
  symbol: 'pump-variable',
  summary: 'Swashplate piston pump: compensator destrokes the pump as outlet pressure approaches the setting.',
  ports: () => [
    ...pumpPorts(),
    port('CD', 'L', 'Case drain', 'drain', 'Case drain – route directly to tank with minimal restriction.'),
  ],
  params: [
    ...commonPumpParams,
    { key: 'compensatorSetting', label: 'Compensator setting', quantity: 'none', min: 20, max: 350, default: 190, live: false, description: 'bar' },
  ],
  inputs: gearPumpModel.inputs,
  faultKinds: ['pump-wear', 'pump-shaft-sheared'],
  build: (ctx, def) => pumpBuild(ctx, def, true),
};

export const manualPumpModel: ComponentModel = {
  ...gearPumpModel,
  type: 'pump-manual',
  name: 'Manual hand pump',
  symbol: 'pump-manual',
  summary: 'Hand-operated piston pump with integral checks. Each stroke displaces a fixed volume.',
  params: [
    { key: 'displacement', label: 'Volume per stroke', quantity: 'none', min: 1, max: 60, default: 12, description: 'cm³/stroke' },
    { key: 'speed', label: 'Strokes per minute', quantity: 'rpm', min: 0, max: 60, default: 0, live: true },
    { key: 'ratedSpeed', label: 'Rated strokes/min', quantity: 'rpm', default: 40 },
    { key: 'volumetricEfficiency', label: 'Vol. efficiency', quantity: 'ratio', default: 0.97 },
    { key: 'mechanicalEfficiency', label: 'Mech. efficiency', quantity: 'ratio', default: 0.9 },
    { key: 'testPressure', label: 'Test pressure', quantity: 'none', default: 300 },
  ],
  inputs: [{ key: 'speed', label: 'Strokes per minute', min: 0, max: 60, default: 0, quantity: 'rpm', step: 1 }],
  faultKinds: ['pump-wear'],
};


import { BAR, LITRE, MM, CC, circleArea, clamp } from '../core/units';
import { orificeFlow } from '../physics/flow';
import type { NodeInfo, StepEnv } from '../hydraulics/types';
import { type ComponentModel, arr, baseRuntime, bool, branch, element, num, port } from './base';

const MM2 = 1e-6;

/**
 * Hydraulic cylinder (single- or double-acting, optionally telescopic).
 *
 * Approximations (documented):
 *  - The piston is treated as massless with lumped viscous damping c (N·s/m)
 *    plus Coulomb seal friction. Velocity follows the instantaneous force
 *    balance v = (pA·AA − pB·AB − F_load ∓ F_friction)/c. Inertia of the
 *    driven load is neglected (acceptable for slow hoists/booms).
 *  - Telescopic stages extend largest-first; each stage is a separate
 *    effective area so pressure steps up as stages change – the real
 *    signature of a telescopic hoist.
 *  - Single-acting cylinders vent the rod side through a breather; piston
 *    seal bypass therefore appears as oil at the breather.
 */
export const cylinderModel: ComponentModel = {
  type: 'cylinder',
  name: 'Hydraulic cylinder',
  category: 'actuator',
  symbol: 'cylinder',
  summary: 'Converts hydraulic pressure and flow into linear force and motion: F = p·A, v = Q/A.',
  ports: (def) =>
    bool(def, 'singleActing', false)
      ? [port('A', 'A', 'Cap-end (extend) port', 'work', 'Pressurise to extend. Rod side is vented through the breather.')]
      : [
          port('A', 'A', 'Cap-end (extend) port', 'work', 'Pressurise to extend.'),
          port('B', 'B', 'Rod-end (retract) port', 'work', 'Pressurise to retract.'),
        ],
  params: [
    { key: 'bore', label: 'Bore', quantity: 'none', min: 20, max: 400, default: 80, description: 'mm' },
    { key: 'rod', label: 'Rod diameter', quantity: 'none', min: 10, max: 300, default: 45, description: 'mm' },
    { key: 'stroke', label: 'Stroke', quantity: 'length', min: 0.05, max: 8, default: 0.5, step: 0.05 },
    { key: 'singleActing', label: 'Single-acting', quantity: 'none', default: false },
    { key: 'externalLoad', label: 'External load (opposes extension)', quantity: 'force', min: 0, max: 2e6, default: 10000, live: true, step: 500 },
    { key: 'friction', label: 'Viscous damping', quantity: 'none', min: 1000, max: 200000, default: 6000, description: 'N·s/m' },
    { key: 'sealFriction', label: 'Seal friction', quantity: 'force', min: 0, max: 20000, default: 400 },
    { key: 'initialPosition', label: 'Initial extension', quantity: 'ratio', min: 0, max: 1, default: 0 },
  ],
  inputs: [{ key: 'externalForce', label: 'External load', min: 0, max: 2e6, default: 10000, quantity: 'force', step: 500 }],
  faultKinds: ['cyl-seal-bypass', 'cyl-rod-seal-leak', 'cyl-binding', 'cyl-bent-rod'],
  build(ctx, def) {
    const env = ctx.envRef;
    const rt = baseRuntime(def);
    const single = bool(def, 'singleActing', false);
    const stroke = num(def, 'stroke', 0.5);
    const stagesMm = arr(def, 'stages', [num(def, 'bore', 80)]);
    const stages = stagesMm.map((d) => circleArea(d * MM));
    const stageStroke = stroke / stages.length;
    const rodArea = circleArea(num(def, 'rod', 45) * MM);
    const Ab = single ? 0 : Math.max(stages[0]! - rodArea, 1e-5);
    const c = num(def, 'friction', 6000);
    const seal = num(def, 'sealFriction', 400);
    const dead = 0.2 * LITRE;
    let x = clamp(num(def, 'initialPosition', 0), 0, 1) * stroke;
    let v = 0;
    rt.inputs = { externalForce: num(def, 'externalLoad', 10000) };

    const nA = ctx.port(def, 'A', dead);
    const nB = single ? ctx.atmosphere() : ctx.port(def, 'B', dead);
    rt.portNodes = single ? { A: nA } : { A: nA, B: nB };
    const infoA: NodeInfo = ctx.nodeInfo(nA);
    const infoB: NodeInfo | null = single ? null : ctx.nodeInfo(nB);
    const baseA = infoA.volume;
    const baseB = infoB?.volume ?? 0;

    const stageIndex = (pos: number) => Math.min(stages.length - 1, Math.max(0, Math.floor(pos / stageStroke + 1e-9)));
    const areaA = (pos: number) => stages[stageIndex(pos)]!;
    const swept = (pos: number) => stages.reduce((s, a, i) => s + a * clamp(pos - i * stageStroke, 0, stageStroke), 0);
    const sev = (k: string) => env.current.faults.severity(def.id, k);
    const totalRetractFriction = () => seal + 35000 * Math.max(sev('cyl-binding'), sev('cyl-bent-rod') * 0.8);

    const velocity = (pA: number, pB: number) => {
      const Aa = areaA(x);
      const Fload = rt.inputs.externalForce ?? 0;
      const Fnet = pA * Aa - (single ? 0 : pB * Ab) - Fload;
      const Fc = totalRetractFriction();
      let vel = 0;
      if (Fnet > Fc) vel = (Fnet - Fc) / c;
      else if (Fnet < -Fc) vel = (Fnet + Fc) / c;
      if (x <= 0 && vel < 0) vel = 0;
      if (x >= stroke && vel > 0) vel = 0;
      return vel;
    };

    if (single) {
      rt.elements.push(
        element(`${def.id}:piston`, def.id, `${def.label} piston`, [nA], (p, out) => {
          out[0] = -areaA(x) * velocity(p[nA]!, 0);
        }, false),
      );
    } else {
      rt.elements.push(
        element(`${def.id}:piston`, def.id, `${def.label} piston`, [nA, nB], (p, out) => {
          const vel = velocity(p[nA]!, p[nB]!);
          out[0] = -areaA(x) * vel;
          out[1] = Ab * vel;
        }, false),
      );
    }
    // Piston seal bypass (internal). For single-acting this discharges at the breather.
    rt.elements.push(
      branch(
        `${def.id}:bypass`,
        def.id,
        `${def.label} piston seal`,
        nA,
        nB,
        (pa, pb) => {
          const s = sev('cyl-seal-bypass');
          return 1e-15 * (pa - pb) + (s > 0 ? orificeFlow(2.5 * MM2 * s, pa - pb, env.current.fluid.rho) : 0);
        },
        true,
        single,
      ),
    );
    const atm = ctx.atmosphere();
    rt.elements.push(
      branch(
        `${def.id}:rodseal`,
        def.id,
        `${def.label} rod/gland seal`,
        single ? nA : nB,
        atm,
        (pa, pb) => {
          const s = Math.max(sev('cyl-rod-seal-leak'), sev('cyl-bent-rod') * 0.5);
          return s > 0 ? orificeFlow(0.8 * MM2 * s, Math.max(0, pa - pb), env.current.fluid.rho) : 0;
        },
        true,
        true,
      ),
    );

    rt.preStep = () => {
      infoA.volume = baseA + swept(x);
      if (infoB) infoB.volume = baseB + Ab * (stroke - x);
    };
    rt.postStep = (e: StepEnv) => {
      v = velocity(e.pressure(nA), single ? 0 : e.pressure(nB));
      x = clamp(x + v * e.dt, 0, stroke);
    };
    rt.getState = () => ({ x, v });
    rt.setState = (s) => {
      x = clamp(s.x ?? x, 0, stroke);
      v = s.v ?? 0;
    };
    rt.readouts = (e) => {
      const pA = e.pressure(nA);
      const pB = single ? 0 : e.pressure(nB);
      return [
        { key: 'position', label: 'Extension', value: x, quantity: 'length' },
        { key: 'extension', label: 'Extension', value: x / stroke, quantity: 'ratio' },
        { key: 'velocity', label: 'Rod velocity', value: v, quantity: 'velocity' },
        { key: 'pA', label: 'Cap-end pressure', value: pA, quantity: 'pressure' },
        ...(single ? [] : [{ key: 'pB', label: 'Rod-end pressure', value: pB, quantity: 'pressure' as const }]),
        { key: 'force', label: 'Hydraulic force', value: pA * areaA(x) - pB * Ab, quantity: 'force' },
        { key: 'load', label: 'Load force', value: rt.inputs.externalForce ?? 0, quantity: 'force' },
        { key: 'stage', label: 'Active stage', value: stageIndex(x) + 1, quantity: 'none' },
        { key: 'area', label: 'Active area', value: areaA(x), quantity: 'area' },
      ];
    };
    return rt;
  },
};

export const motorModel: ComponentModel = {
  type: 'motor',
  name: 'Hydraulic motor',
  category: 'actuator',
  symbol: 'motor',
  summary: 'Converts flow to shaft speed (n = Q/Vd) and pressure to torque (T = Vd·Δp/2π).',
  ports: (def) => [
    port('A', 'A', 'Port A', 'work', 'Pressure here turns the shaft clockwise.'),
    port('B', 'B', 'Port B', 'work', 'Pressure here turns the shaft counter-clockwise.'),
    ...(bool(def, 'caseDrain', false) ? [port('CD', 'L', 'Case drain', 'drain' as const, 'Direct, unrestricted line to tank.')] : []),
  ],
  params: [
    { key: 'displacement', label: 'Displacement', quantity: 'none', min: 5, max: 1000, default: 100, description: 'cm³/rev' },
    { key: 'volumetricEfficiency', label: 'Vol. efficiency', quantity: 'ratio', min: 0.6, max: 0.99, default: 0.94 },
    { key: 'mechanicalEfficiency', label: 'Mech. efficiency', quantity: 'ratio', min: 0.6, max: 0.99, default: 0.9 },
    { key: 'loadTorque', label: 'Load torque', quantity: 'torque', min: 0, max: 5000, default: 50, live: true },
    { key: 'caseDrain', label: 'External case drain', quantity: 'none', default: false },
    { key: 'maxAngle', label: 'Rotation limit (rotary actuator, 0 = continuous)', quantity: 'none', min: 0, max: 720, default: 0, description: 'deg' },
  ],
  inputs: [{ key: 'loadTorque', label: 'Load torque', min: 0, max: 5000, default: 50, quantity: 'torque', step: 5 }],
  faultKinds: ['pump-wear', 'cyl-binding'],
  build(ctx, def) {
    const env = ctx.envRef;
    const rt = baseRuntime(def);
    const Vd = num(def, 'displacement', 100) * CC;
    const volEff = num(def, 'volumetricEfficiency', 0.94);
    const mech = num(def, 'mechanicalEfficiency', 0.9);
    const maxAngle = num(def, 'maxAngle', 0);
    const cd = bool(def, 'caseDrain', false);
    const nA = ctx.port(def, 'A', 0.05e-3);
    const nB = ctx.port(def, 'B', 0.05e-3);
    const nL = cd ? ctx.port(def, 'CD', 0.02e-3) : nB;
    rt.portNodes = cd ? { A: nA, B: nB, CD: nL } : { A: nA, B: nB };
    // loadTorque: friction-like resistance (both directions). externalTorque: signed
    // load torque (positive opposes positive rotation) – e.g. a suspended winch load.
    rt.inputs = { loadTorque: num(def, 'loadTorque', 50), externalTorque: 0 };
    const G0 = ((1 - volEff) * Vd * (1500 / 60)) / (150 * BAR);
    const damping = 0.04; // N·m per rpm
    let n = 0;
    let angle = 0;
    const sev = (k: string) => env.current.faults.severity(def.id, k);
    const speed = (pA: number, pB: number) => {
      const T = ((Vd * (pA - pB)) / (2 * Math.PI)) * mech - (rt.inputs.externalTorque ?? 0);
      const resist = (rt.inputs.loadTorque ?? 0) + 2 + 400 * sev('cyl-binding');
      let s = 0;
      if (T > resist) s = (T - resist) / damping;
      else if (T < -resist) s = (T + resist) / damping;
      if (maxAngle > 0) {
        if (angle >= maxAngle && s > 0) s = 0;
        if (angle <= 0 && s < 0) s = 0;
      }
      return s;
    };
    const G = () => G0 * (1 + 20 * sev('pump-wear')) * (env.current.fluid.muRef / env.current.fluid.mu);
    rt.elements.push(
      element(`${def.id}:rotor`, def.id, `${def.label} rotor`, [nA, nB], (p, out) => {
        const q = Vd * (speed(p[nA]!, p[nB]!) / 60);
        out[0] = -q;
        out[1] = q;
      }, false),
    );
    rt.elements.push(
      element(`${def.id}:leak`, def.id, `${def.label} internal leakage`, cd ? [nA, nB, nL] : [nA, nB], (p, out) => {
        const g = G();
        if (cd) {
          const la = g * (p[nA]! - p[nL]!);
          const lb = g * (p[nB]! - p[nL]!);
          out[0] = -la;
          out[1] = -lb;
          out[2] = la + lb;
        } else {
          const l = g * (p[nA]! - p[nB]!);
          out[0] = -l;
          out[1] = l;
        }
      }),
    );
    rt.postStep = (e) => {
      n = speed(e.pressure(nA), e.pressure(nB));
      angle += n * 6 * e.dt;
      if (maxAngle > 0) angle = clamp(angle, 0, maxAngle);
    };
    rt.getState = () => ({ n, angle });
    rt.setState = (s) => {
      n = s.n ?? 0;
      angle = s.angle ?? 0;
    };
    rt.readouts = (e) => [
      { key: 'speed', label: 'Shaft speed', value: n, quantity: 'rpm' },
      { key: 'torque', label: 'Output torque', value: ((Vd * (e.pressure(nA) - e.pressure(nB))) / (2 * Math.PI)) * mech, quantity: 'torque' },
      { key: 'load', label: 'Load torque', value: rt.inputs.externalTorque ?? 0, quantity: 'torque' },
      { key: 'dp', label: 'Δp across motor', value: e.pressure(nA) - e.pressure(nB), quantity: 'pressure' },
      ...(maxAngle > 0 ? [{ key: 'angle', label: 'Angle (deg)', value: angle, quantity: 'none' as const }] : []),
    ];
    return rt;
  },
};

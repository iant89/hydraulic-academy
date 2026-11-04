import { describe, expect, it } from 'vitest';
import { BAR, LPM } from '@/simulation/core/units';
import { MachineSimulation } from '@/simulation/machine/machine';
import { serviceCraneDefinition } from '@/equipment/service-crane/definition';
import { validateCircuit } from '@/simulation/circuits/validation';
import { SERVICE_CRANE_BRIEFS } from '@/data/scenarios/service-crane.briefs';
import { SERVICE_CRANE_KEYS } from '@/data/scenarios/service-crane.keys';
import { DiagnosticSession } from '@/simulation/scenarios/session';
import { BUILTIN_PROFILES } from '@/data/equipment/profiles';
import { machineFromProfile } from '@/equipment/registry';
import { WorkshopJob, replacementProcedure } from '@/workshop/procedures';
import { partById } from '@/data/parts/catalog';

const def = serviceCraneDefinition();
const scenario = (id: string) => ({ brief: SERVICE_CRANE_BRIEFS.find((b) => b.id === id)!, key: SERVICE_CRANE_KEYS.find((k) => k.scenarioId === id)! });

function ready(m: MachineSimulation) {
  m.startEngine();
  m.advance(1);
  m.setPtoSwitch(true);
  m.advance(2);
  m.setThrottle(0.25);
  m.advance(1);
}
function run(m: MachineSimulation, fn: string, cmd: number, s: number) {
  m.setFunction(fn, cmd);
  m.advance(s);
  m.setFunction(fn, 0);
  m.advance(0.5);
}
/** Stabilizer down, boom up, pick the load. */
function lift(m: MachineSimulation) {
  ready(m);
  run(m, 'outrigger', 1, 6);
  run(m, 'lift', 1, 6);
  run(m, 'winch', 1, 6);
}

describe('service crane – circuit and physics', () => {
  it('reuses the shared component models and validates cleanly', () => {
    const types = new Set(def.circuit.components.map((c) => c.type));
    for (const t of ['pump-gear', 'relief-valve', 'dcv', 'counterbalance', 'pilot-check', 'cylinder', 'motor', 'reservoir', 'filter']) expect(types.has(t)).toBe(true);
    expect(validateCircuit(def.circuit).filter((i) => i.severity === 'danger' || i.severity === 'error')).toEqual([]);
  });

  it('every function moves its actuator in both directions', () => {
    const m = new MachineSimulation(def, { seed: 1 });
    ready(m);
    for (const f of def.functions) {
      for (const dir of [1, -1]) {
        m.setFunction(f.id, dir);
        m.advance(f.id === 'lift' || f.id === 'extend' || f.id === 'outrigger' ? 2 : 1);
        if (f.id === 'lift' || f.id === 'extend' || f.id === 'outrigger') {
          if (dir === 1) expect(m.sim.readout(f.actuator, 'velocity'), `${f.id} +`).toBeGreaterThan(0.01);
        } else expect(Math.sign(m.sim.readout(f.actuator, 'speed')), `${f.id} ${dir}`).toBe(dir);
        m.setFunction(f.id, 0);
        m.advance(0.3);
      }
      // retract fully what was extended
      if (f.id === 'lift' || f.id === 'extend' || f.id === 'outrigger') run(m, f.id, -1, 4);
    }
  });

  it('lift pressure follows the load moment and the load is held by the counterbalance', () => {
    const m = new MachineSimulation(def, { seed: 1, hookLoad: 1000 });
    lift(m);
    const s = m.craneState()!;
    expect(s.loadSuspended).toBe(true);
    expect(s.outriggerSet).toBe(true);
    const p1 = m.sim.pressureAt('cyl-lift', 'A');
    run(m, 'extend', 1, 8);
    expect(m.sim.pressureAt('cyl-lift', 'A')).toBeGreaterThan(p1 * 1.25);
    const x = m.sim.readout('cyl-lift', 'position');
    m.advance(40);
    expect(Math.abs(m.sim.readout('cyl-lift', 'position') - x) * 1000).toBeLessThan(3);
    // valve bank work ports vent to tank in neutral – no pressure build-up on the rod side
    expect(m.sim.pressureAt('cyl-lift', 'B')).toBeLessThan(5 * BAR);
  });

  it('load-moment limiter cuts out boom down / extend / winch up – but still allows the motions that reduce the moment', () => {
    const m = new MachineSimulation(def, { seed: 1, hookLoad: 1500 });
    lift(m);
    run(m, 'extend', 1, 12);
    expect(m.events.some((e) => e.code === 'lmi-cutout')).toBe(true);
    expect(m.inhibited.extend).toContain(1);
    const L = m.craneState()!.boomLength;
    run(m, 'extend', 1, 3);
    expect(m.craneState()!.boomLength).toBeCloseTo(L, 2);
    run(m, 'extend', -1, 6);
    expect(m.craneState()!.boomLength).toBeLessThan(L - 0.1);
  });

  it('anti-two-block stops the winch at the boom tip', () => {
    const m = new MachineSimulation(def, { seed: 1 });
    ready(m);
    run(m, 'winch', 1, 20);
    expect(m.events.some((e) => e.code === 'a2b')).toBe(true);
    expect(m.craneState()!.cableOut).toBeGreaterThan(0.25);
  });

  it('lifting without the stabilizer is flagged as unsafe and halves capacity', () => {
    const m = new MachineSimulation(def, { seed: 1, hookLoad: 800 });
    ready(m);
    run(m, 'lift', 1, 4);
    run(m, 'winch', 1, 5);
    expect(m.craneState()!.loadSuspended).toBe(true);
    expect(m.events.some((e) => e.code === 'unstable-lift')).toBe(true);
    expect(m.craneState()!.capacity).toBe(def.mechanisms[0]!.type === 'crane' ? 22500 : 0);
  });

  it('main relief limits pressure when a function dead-heads', () => {
    const m = new MachineSimulation(def, { seed: 1 });
    ready(m);
    run(m, 'outrigger', 1, 8);
    m.setFunction('outrigger', 1);
    m.advance(2);
    expect(m.sim.pressureAt('pump', 'OUT') / BAR).toBeGreaterThan(188);
    expect(m.sim.pressureAt('pump', 'OUT') / BAR).toBeLessThan(205);
    expect(m.pumpFlow() / LPM).toBeGreaterThan(15);
  });
});

describe('service crane – scenarios', () => {
  const holdTest = (id: string) => {
    const s = new DiagnosticSession(def, scenario(id));
    const m = s.machine;
    lift(m);
    const x = m.sim.readout('cyl-lift', 'position');
    const o = m.sim.readout('cyl-out', 'position');
    m.advance(45);
    return { s, lift: (x - m.sim.readout('cyl-lift', 'position')) * 1000, out: (o - m.sim.readout('cyl-out', 'position')) * 1000 };
  };

  it('every brief has a key and no fault data leaks into briefs', () => {
    for (const b of SERVICE_CRANE_BRIEFS) {
      expect(SERVICE_CRANE_KEYS.some((k) => k.scenarioId === b.id)).toBe(true);
      expect(JSON.stringify(b)).not.toMatch(/"kind":|"severity":|"target":/);
    }
  });

  it('normal crane holds; leaking counterbalance drifts; leaking stabilizer lock settles the truck', () => {
    const n = holdTest('sc-normal');
    expect(n.lift).toBeLessThan(5);
    expect(n.out).toBeLessThan(2);
    const d = holdTest('sc-boom-drift');
    expect(d.lift).toBeGreaterThan(10);
    const st = holdTest('sc-stabilizer-creep');
    expect(st.out).toBeGreaterThan(20);
  });

  it('worn winch motor lifts slower than a healthy one', () => {
    const speed = (id: string) => {
      const s = new DiagnosticSession(def, scenario(id));
      lift(s.machine);
      s.machine.setFunction('winch', 1);
      s.machine.advance(2);
      return s.machine.sim.readout('mot-winch', 'speed');
    };
    expect(speed('sc-winch-weak')).toBeLessThan(speed('sc-normal') * 0.75);
  });

  it('low relief stalls the boom at reach without a load-moment alarm', () => {
    const s = new DiagnosticSession(def, scenario('sc-relief-low'));
    const m = s.machine;
    lift(m);
    run(m, 'extend', 1, 10);
    run(m, 'lift', 1, 4);
    const ang = m.craneState()!.boomAngle;
    run(m, 'lift', 1, 4);
    expect(m.craneState()!.boomAngle).toBeCloseTo(ang, 0);
    expect(m.events.some((e) => e.code === 'lmi-cutout')).toBe(false);
    expect(m.sim.pressureAt('pump', 'OUT') / BAR).toBeLessThan(115);
  });

  it('repair: replace the leaking lift counterbalance with safe isolation, then the boom holds', () => {
    const profile = BUILTIN_PROFILES.find((p) => p.id === 'generic-svc-crane')!;
    const s = new DiagnosticSession(machineFromProfile(profile), scenario('sc-boom-drift'));
    const m = s.machine;
    lift(m);
    const job = new WorkshopJob(m, replacementProcedure(m, 'cb-lift'), profile, machineFromProfile(profile).circuit);
    expect(partById('cb-60')).toBeTruthy();
    for (const st of job.procedure.steps) {
      const r = job.run(st.id, st.id === 'select' ? { partId: 'cb-60' } : st.id === 'torque' ? { acknowledgeSpec: true } : {});
      expect(r.ok, `${st.id}: ${r.message} ${(r.details ?? []).join(' | ')}`).toBe(true);
    }
    expect(m.events.some((e) => e.code === 'unsupported-load' || e.code === 'opened-under-pressure')).toBe(false);
    m.sim.setInput('cb-lift', 'setting', 180e5);
    m.setHookLoad(1000);
    lift(m);
    const x = m.sim.readout('cyl-lift', 'position');
    m.advance(45);
    expect((x - m.sim.readout('cyl-lift', 'position')) * 1000).toBeLessThan(5);
  });
});

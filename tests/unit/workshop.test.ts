import { describe, expect, it } from 'vitest';
import { BAR, LPM } from '@/simulation/core/units';
import { MachineSimulation } from '@/simulation/machine/machine';
import { dumpTruckDefinition } from '@/equipment/dump-truck/definition';
import { BUILTIN_PROFILES } from '@/data/equipment/profiles';
import { WorkshopJob, replacementProcedure, hoseProcedure } from '@/workshop/procedures';
import { checkCompatibility } from '@/equipment/shared/compatibility';
import { partById } from '@/data/parts/catalog';
import { benchTest } from '@/workshop/bench';
import { machineFromProfile } from '@/equipment/registry';

const profile = BUILTIN_PROFILES[0]!;
const ref = dumpTruckDefinition().circuit;

function runAll(job: WorkshopJob, opts: Record<string, Parameters<WorkshopJob['run']>[1]> = {}) {
  const results: Record<string, ReturnType<WorkshopJob['run']>> = {};
  for (const step of job.procedure.steps) results[step.id] = job.run(step.id, opts[step.id] ?? {});
  return results;
}

function measureFlowAtLoad(m: MachineSimulation) {
  m.startEngine();
  m.advance(1);
  m.setPtoSwitch(true);
  m.advance(1.5);
  m.setThrottle(0.35);
  m.setHoist(1);
  m.advance(6);
  return m.pumpFlow();
}

describe('component replacement modifies the real simulation', () => {
  it('replacing a worn pump with a compatible part restores flow under load', () => {
    const faults = [{ id: 'f', kind: 'pump-wear', target: 'pump', severity: 0.7 }];
    const worn = new MachineSimulation(dumpTruckDefinition(), { seed: 2, faults, initialTemperature: 50 });
    const qWorn = measureFlowAtLoad(worn);

    const m = new MachineSimulation(dumpTruckDefinition(), { seed: 2, faults, initialTemperature: 50 });
    const job = new WorkshopJob(m, replacementProcedure(m, 'pump'), profile, ref);
    const r = runAll(job, { select: { partId: 'gp-70-ccw-sae-b' }, torque: { acknowledgeSpec: true } });
    for (const [id, res] of Object.entries(r)) expect(res.ok, `${id}: ${res.message}`).toBe(true);
    expect(r.inspect!.details!.join(' ')).toMatch(/wear/i);
    expect(m.faults.outstanding().length).toBe(0);
    const qNew = measureFlowAtLoad(m);
    expect(qNew).toBeGreaterThan(qWorn * 1.3);
    expect(qNew / LPM).toBeGreaterThan(95);
  });

  it('safety prerequisites block opening lines before isolation', () => {
    const m = new MachineSimulation(dumpTruckDefinition(), { seed: 2 });
    m.startEngine();
    const job = new WorkshopJob(m, replacementProcedure(m, 'pump'), profile, ref);
    const r = job.run('disconnect');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/zero pressure/);
    expect(m.disconnected.size).toBe(0);
  });

  it('a wrong-rotation pump installs but produces no system flow', () => {
    const m = new MachineSimulation(dumpTruckDefinition(), { seed: 2 });
    const job = new WorkshopJob(m, replacementProcedure(m, 'pump'), profile, ref);
    const r = runAll(job, { select: { partId: 'gp-70-cw-sae-b' }, torque: { acknowledgeSpec: true } });
    expect(r.select!.issues!.some((i) => i.field === 'rotation')).toBe(true);
    const q = measureFlowAtLoad(m);
    expect(q / LPM).toBeLessThan(1);
  });

  it('mounting mismatches are blocking', () => {
    const issues = checkCompatibility(partById('gp-70-ccw-sae-a')!, profile.slots.pump!);
    expect(issues.filter((i) => i.severity === 'blocking').map((i) => i.field)).toEqual(expect.arrayContaining(['mount', 'shaft']));
    expect(checkCompatibility(partById('gp-70-ccw-sae-b')!, profile.slots.pump!)).toEqual([]);
    expect(checkCompatibility(partById('dv-3w-150-24v')!, profile.slots.dcv!).some((i) => i.field === 'voltage')).toBe(true);
  });

  it('reconnecting lines to the wrong ports is detected by verification', () => {
    const m = new MachineSimulation(dumpTruckDefinition(), { seed: 2 });
    const job = new WorkshopJob(m, replacementProcedure(m, 'dcv'), profile, ref);
    const steps = job.procedure.steps.map((s) => s.id);
    for (const id of steps.slice(0, steps.indexOf('reconnect'))) job.run(id, id === 'select' ? { partId: 'dv-3w-150-12v' } : id === 'torque' ? { acknowledgeSpec: true } : {});
    const swapped = job.run('reconnect', {
      reconnect: [
        { connection: 'pressure', from: { component: 'pump', port: 'OUT' }, to: { component: 'dcv', port: 'T' } },
        { connection: 'return', from: { component: 'dcv', port: 'P' }, to: { component: 'filter', port: 'IN' } },
        { connection: 'relief-supply', from: { component: 'dcv', port: 'P' }, to: { component: 'relief', port: 'P' } },
        { connection: 'work', from: { component: 'dcv', port: 'A' }, to: { component: 'cyl', port: 'A' } },
      ],
    });
    expect(swapped.ok).toBe(true);
    const v = job.run('verify');
    expect(v.details!.join('\n')).toMatch(/reversed|NO overpressure protection/);
  });

  it('hose replacement clears a pin-hole leak', () => {
    const m = new MachineSimulation(dumpTruckDefinition(), { seed: 2, faults: [{ id: 'f', kind: 'hose-pinhole', target: 'work', severity: 1 }] });
    const job = new WorkshopJob(m, hoseProcedure(m, 'work'), profile, ref);
    const r = runAll(job, { replace: { hoseId: 'h-16-2w' }, torque: { acknowledgeSpec: true } });
    for (const [id, res] of Object.entries(r)) expect(res.ok, `${id}: ${res.message}`).toBe(true);
    m.startEngine();
    m.advance(1);
    m.setPtoSwitch(true);
    m.advance(2);
    m.setHoist(1);
    const loss0 = m.sim.externalLoss;
    m.advance(10);
    expect(m.sim.externalLoss - loss0).toBeLessThan(1e-6);
  });
});

describe('bench tests reuse the simulation engine', () => {
  it('detects a worn pump and a seized relief valve', () => {
    const pump = dumpTruckDefinition().circuit.components.find((c) => c.id === 'pump')!;
    const good = benchTest(pump, [], 50)!;
    const worn = benchTest(pump, [{ id: 'f', kind: 'pump-wear', target: 'pump', severity: 0.8 }], 50)!;
    const eff = (r: typeof good) => Number(/≈ (\d+) %/.exec(r.summary)![1]);
    expect(eff(good)).toBeGreaterThan(88);
    expect(eff(worn)).toBeLessThan(eff(good) - 20);
    const relief = dumpTruckDefinition().circuit.components.find((c) => c.id === 'relief')!;
    expect(benchTest(relief, [], 40)!.summary).toMatch(/17\d bar/);
    expect(benchTest(relief, [{ id: 'f', kind: 'relief-stuck-closed', target: 'relief', severity: 1 }], 40)!.summary).toMatch(/seized/);
  });
});

describe('equipment profiles', () => {
  it('a profile configures reusable components without new simulation code', () => {
    const p20 = BUILTIN_PROFILES.find((p) => p.id === 'generic-dt-20')!;
    const def = machineFromProfile(p20);
    expect(def.circuit.components.find((c) => c.id === 'pump')!.params.displacement).toBe(90);
    const mech = def.mechanisms[0]!;
    expect(mech.type === 'dump-body' && mech.ratedPayload).toBe(20000);
    const m = new MachineSimulation(def, { payload: 20000 });
    m.startEngine();
    m.advance(1);
    m.setPtoSwitch(true);
    m.advance(2);
    expect(m.pumpFlow() / LPM).toBeGreaterThan(75);
    m.setThrottle(0.35);
    m.setHoist(1);
    m.advance(40);
    m.advance(2);
    expect(m.sim.pressureAt('pump', 'OUT')).toBeGreaterThan(190 * BAR);
  });

  it('every built-in specification is labelled as simulated training data', () => {
    for (const p of BUILTIN_PROFILES) for (const s of Object.values(p.specs)) expect(s.status).toBe('simulated-training');
  });
});

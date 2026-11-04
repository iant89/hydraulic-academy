import { describe, expect, it } from 'vitest';
import { EXERCISES } from '@/data/exercises';
import { EXPERIMENTS, FUNDAMENTAL_LABS } from '@/data/labs';
import { compareNets, validateCircuit } from '@/simulation/circuits/validation';
import { HydraulicSimulation } from '@/simulation/hydraulics/simulation';

describe('circuit builder exercises', () => {
  for (const ex of EXERCISES) {
    it(`${ex.title}: reference solution is valid and operates`, () => {
      const ref = { ...ex.start(), connections: ex.reference() };
      const bad = validateCircuit(ref).filter((i) => i.severity === 'danger' || i.severity === 'error');
      expect(bad.map((b) => b.message)).toEqual([]);
      expect(compareNets(ref, ref)).toEqual([]);
      if (ex.check) {
        const sim = new HydraulicSimulation(structuredClone(ref), { seed: 1 });
        sim.run(0.5);
        sim.setInput(ex.check.component, ex.check.input, ex.check.value);
        sim.run(1.5);
        expect(Math.abs(sim.readout(ex.check.expect.component, ex.check.expect.key))).toBeGreaterThanOrEqual(Math.abs(ex.check.expect.min));
      }
    });
  }

  it('the incorrect circuit (exercise 8) is flagged with explanations', () => {
    const ex = EXERCISES.find((e) => e.id === 'ex8-fix')!;
    const issues = validateCircuit(ex.start());
    const codes = issues.map((i) => i.code);
    expect(codes).toContain('supply-on-return');
    expect(codes).toContain('pump-inlet-not-suction');
    expect(compareNets(ex.start(), { ...ex.start(), connections: ex.reference() }).length).toBeGreaterThan(0);
  });

  it('tee position does not matter for net comparison', () => {
    const ex = EXERCISES[0]!;
    const ref = { ...ex.start(), connections: ex.reference() };
    const alt = structuredClone(ref);
    alt.connections.find((c) => c.id === 'rv')!.from = { component: 'dcv', port: 'P' };
    expect(compareNets(alt, ref)).toEqual([]);
  });
});

describe('labs and experiments run on the engine', () => {
  for (const lab of [...EXPERIMENTS, ...FUNDAMENTAL_LABS]) {
    it(`${lab.title} builds and steps`, () => {
      const sim = new HydraulicSimulation(lab.circuit(), { seed: 1 });
      sim.run(1);
      expect(sim.lastSolve.converged).toBe(true);
      for (const r of lab.readouts) {
        if (r.kind === 'pressure') expect(Number.isFinite(sim.pressureAt(r.component, r.port))).toBe(true);
        if (r.kind === 'readout') expect(Number.isFinite(sim.readout(r.component, r.key))).toBe(true);
      }
    });
  }

  it('manual pump lifts the ram once pressure reaches F/A', () => {
    const lab = FUNDAMENTAL_LABS.find((l) => l.id === 'manual-pump')!;
    const sim = new HydraulicSimulation(lab.circuit(), { seed: 1 });
    sim.setInput('pump', 'speed', 30);
    sim.run(20);
    expect(sim.readout('cyl', 'extension')).toBeGreaterThan(0.05);
    expect(sim.pressureAt('cyl', 'A') / 1e5).toBeGreaterThan(95);
    sim.setInput('pump', 'speed', 0);
    const x = sim.readout('cyl', 'position');
    sim.run(5);
    expect(Math.abs(sim.readout('cyl', 'position') - x)).toBeLessThan(0.002);
  });
});

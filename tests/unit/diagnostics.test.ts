import { describe, expect, it } from 'vitest';
import { dumpTruckDefinition } from '@/equipment/dump-truck/definition';
import { DUMP_TRUCK_BRIEFS } from '@/data/scenarios/dump-truck.briefs';
import { DUMP_TRUCK_KEYS } from '@/data/scenarios/dump-truck.keys';
import { DiagnosticSession } from '@/simulation/scenarios/session';
import { validateCircuit } from '@/simulation/circuits/validation';
import { WorkshopJob, simpleProcedure } from '@/workshop/procedures';
import { BUILTIN_PROFILES } from '@/data/equipment/profiles';
import { basicCylinderCircuit } from '@/simulation/circuits/library';

const def = dumpTruckDefinition();
const scenario = (id: string) => ({ brief: DUMP_TRUCK_BRIEFS.find((b) => b.id === id)!, key: DUMP_TRUCK_KEYS.find((k) => k.scenarioId === id)! });

function verificationCycle(s: DiagnosticSession) {
  const m = s.machine;
  m.setEmergencyStop(false);
  m.setPayload(m.body!.cfg.ratedPayload);
  if (!m.controls.engineRunning) m.startEngine();
  m.setThrottle(0);
  m.advance(1);
  m.setPtoSwitch(true);
  m.advance(2);
  m.setThrottle(0.35);
  m.setHoist(1);
  m.advance(28);
  m.setHoist(-1);
  while (m.cylinderExtension() > 0.5) m.advance(0.2);
  m.setHoist(0);
  m.advance(40);
  m.setHoist(-1);
  m.advance(40);
  m.setHoist(0);
}

describe('scenario library', () => {
  it('every brief has a hidden key, and briefs contain no fault data', () => {
    for (const b of DUMP_TRUCK_BRIEFS) {
      expect(DUMP_TRUCK_KEYS.some((k) => k.scenarioId === b.id)).toBe(true);
      expect(JSON.stringify(b)).not.toMatch(/"kind":|"severity":|"faults":|"target":/);
    }
  });

  it('scenarios are reproducible', () => {
    const run = () => {
      const s = new DiagnosticSession(def, scenario('dt-dcv-sticking'));
      verificationCycle(s);
      return [s.machine.cylinderExtension(), s.machine.sim.fluidState.temperature, s.tracker.results.lastLoadedRaiseSeconds];
    };
    expect(run()).toEqual(run());
  });

  it('different failures produce distinguishable symptoms', () => {
    const sig = (id: string) => {
      const s = new DiagnosticSession(def, scenario(id));
      verificationCycle(s);
      const r = s.tracker.results;
      return { raised: r.lastLoadedRaiseSeconds !== null, endP: r.endOfStrokePressure ?? 0, drift: r.worstHoldDrift ?? 0, cav: r.cavitationWhileRaising, pto: r.ptoDrive };
    };
    const normal = sig('dt-normal');
    expect(normal).toMatchObject({ raised: true, cav: false, pto: true });
    expect(sig('dt-pto-no-engage').pto).toBe(false);
    expect(sig('dt-relief-stuck-open').raised).toBe(false);
    expect(sig('dt-cylinder-bypass').drift).toBeGreaterThan(50);
    expect(sig('dt-restricted-suction').cav).toBe(true);
    expect(sig('dt-relief-misadjusted').raised).toBe(false);
  });
});

describe('diagnostic scoring', () => {
  it('rewards a correct, verified, safe diagnosis', () => {
    const s = new DiagnosticSession(def, scenario('dt-pto-no-engage'));
    s.record('operate', 'op:raise', 'Attempted raise');
    s.addHypothesis('PTO solenoid not receiving power or coil failed', 'pto-sol', 'pto-solenoid-open');
    s.record('test', 'meter:pto-sol:voltage', '13.9 V');
    s.record('test', 'meter:pto-sol:resistance', 'OL');
    s.confirmFailure('pto-sol', 'pto-solenoid-open');
    const job = new WorkshopJob(s.machine, simpleProcedure('solenoid', 'pto-sol', 'PTO shift solenoid'), BUILTIN_PROFILES[0]!, def.circuit);
    for (const st of job.procedure.steps) expect(job.run(st.id).ok, st.id).toBe(true);
    s.markRepairComplete();
    verificationCycle(s);
    // relief check at end of stroke happens in the raise; leak-free time accrues while pressurised
    const report = s.evaluate();
    const v = Object.fromEntries(report.verification.map((x) => [x.criterion.type, x.met]));
    expect(v['pto-drive']).toBe(true);
    expect(v['raise-loaded']).toBe(true);
    expect(v['hold-drift']).toBe(true);
    expect(report.categories.find((c) => c.id === 'identification')!.score).toBe(1);
    expect(report.categories.find((c) => c.id === 'safety')!.score).toBe(1);
    expect(report.unresolvedFaults).toBe(0);
    expect(report.total).toBeGreaterThan(85);
  });

  it('penalises guessing: unnecessary replacements and wrong conclusions', () => {
    const s = new DiagnosticSession(def, scenario('dt-pto-no-engage'));
    s.recordReplacement('pump');
    s.confirmFailure('pump', 'pump-wear');
    const report = s.evaluate();
    expect(report.categories.find((c) => c.id === 'replacement')!.score).toBeLessThan(1);
    expect(report.categories.find((c) => c.id === 'identification')!.score).toBe(0);
    expect(report.passed).toBe(false);
  });
});

describe('circuit validation', () => {
  it('accepts the reference dump truck circuit and the basic circuit', () => {
    const bad = (c: Parameters<typeof validateCircuit>[0]) => validateCircuit(c).filter((i) => i.severity === 'danger' || i.severity === 'error');
    expect(bad(def.circuit)).toEqual([]);
    expect(bad(basicCylinderCircuit())).toEqual([]);
  });

  it('explains reversed P/T and missing relief protection', () => {
    const c = structuredClone(def.circuit);
    c.connections.find((x) => x.id === 'pressure')!.to = { component: 'dcv', port: 'T' };
    c.connections.find((x) => x.id === 'return')!.from = { component: 'dcv', port: 'P' };
    const issues = validateCircuit(c);
    const supply = issues.find((i) => i.code === 'supply-on-return');
    expect(supply?.severity).toBe('danger');
    expect(supply?.consequence).toMatch(/NO overpressure protection/);
    expect(issues.some((i) => i.code === 'no-relief')).toBe(true);
  });

  it('flags a plugged case drain and an under-rated pressure hose', () => {
    const c = basicCylinderCircuit();
    c.components.find((x) => x.id === 'pump')!.type = 'pump-piston-pc';
    c.connections.find((x) => x.id === 'pressure')!.hose.workingPressure = 100e5;
    const codes = validateCircuit(c).map((i) => i.code);
    expect(codes).toContain('drain-open');
    expect(codes).toContain('hose-underrated');
  });

  it('flags a pump inlet connected to a return port', () => {
    const c = basicCylinderCircuit();
    c.connections.find((x) => x.id === 'suction')!.from = { component: 'tank', port: 'R' };
    const codes = validateCircuit(c).map((i) => i.code);
    expect(codes).toContain('pump-inlet-not-suction');
  });
});

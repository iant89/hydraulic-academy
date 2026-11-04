import { describe, expect, it } from 'vitest';
import { BAR, LPM } from '@/simulation/core/units';
import { MachineSimulation } from '@/simulation/machine/machine';
import { dumpTruckDefinition } from '@/equipment/dump-truck/definition';
import { readMultimeter, readGauge, GAUGES, readTach, takeFluidSample } from '@/simulation/sensors/instruments';
import { observe } from '@/simulation/scenarios/observations';

const truck = (opts: ConstructorParameters<typeof MachineSimulation>[1] = {}) => new MachineSimulation(dumpTruckDefinition(), { seed: 7, ...opts });
const g250 = GAUGES.find((g) => g.id === 'g-250')!;

function startAndEngage(m: MachineSimulation) {
  m.startEngine();
  m.advance(1);
  m.setPtoSwitch(true);
  m.advance(1.5);
}

describe('dump truck – operation', () => {
  it('PTO engages only with engine running, parking brake set and at low engine speed', () => {
    const m = truck();
    m.setIgnition(true);
    m.setPtoSwitch(true);
    m.advance(1);
    expect(m.pto.state).toBe('disengaged');
    m.setPtoSwitch(false);
    m.startEngine();
    m.setThrottle(0.6);
    m.advance(3);
    m.setPtoSwitch(true);
    m.advance(2);
    expect(m.pto.state).toBe('disengaged');
    expect(m.events.some((e) => e.code === 'engage-inhibited')).toBe(true);
    m.setThrottle(0);
    m.advance(3);
    expect(m.pto.state).toBe('engaged');
    m.setParkingBrake(false);
    m.advance(0.1);
    expect(m.pto.state).toBe('disengaged');
  });

  it('PTO drives the pump at engine speed × ratio and the pump delivers flow', () => {
    const m = truck();
    startAndEngage(m);
    expect(readTach(m, 'pump')).toBeCloseTo(700 * 1.3, -1);
    expect(m.pumpFlow() / LPM).toBeGreaterThan(55);
  });

  it('raises a rated load in ≈20 s with stepped stage pressures, then relieves at end of stroke', () => {
    const m = truck();
    startAndEngage(m);
    m.setThrottle(0.35);
    m.setHoist(1);
    const pressures: number[] = [];
    let t = 0;
    while (m.cylinderExtension() < 0.99 && t < 40) {
      m.advance(1);
      t += 1;
      pressures.push(m.sim.pressureAt('cyl', 'A'));
    }
    expect(t).toBeGreaterThan(15);
    expect(t).toBeLessThan(24);
    m.advance(2);
    const p = readGauge(m, 'TP1', g250).value;
    expect(p).toBeGreaterThan(172 * BAR);
    expect(p).toBeLessThan(195 * BAR);
    expect(m.bodyAngle()).toBeGreaterThan(40);
    expect(m.body!.payload).toBeLessThan(13600 * 0.2);
  });

  it('lowers by gravity and returns all fluid to the reservoir', () => {
    const m = truck();
    const v0 = m.sim.readout('tank', 'volume');
    startAndEngage(m);
    m.setThrottle(0.35);
    m.setHoist(1);
    m.advance(25);
    expect(m.sim.readout('tank', 'volume')).toBeLessThan(v0 - 0.03);
    m.setHoist(-1);
    m.advance(40);
    expect(m.cylinderExtension()).toBeLessThan(0.01);
    expect(m.sim.readout('tank', 'volume')).toBeCloseTo(v0, 3);
  });

  it('emergency stop stops the engine and de-energises controls', () => {
    const m = truck();
    startAndEngage(m);
    m.setHoist(1);
    m.setEmergencyStop(true);
    m.advance(2);
    expect(m.controls.engineRunning).toBe(false);
    expect(m.pto.state).toBe('disengaged');
    expect(m.startEngine()).toBe(false);
  });

  it('lockout/tagout prevents engine start', () => {
    const m = truck();
    m.safety.lotoApplied = true;
    expect(m.startEngine()).toBe(false);
  });
});

describe('dump truck – electrical diagnostics', () => {
  it('open PTO coil: voltage present at connector, resistance OL, PTO does not engage', () => {
    const m = truck({ faults: [{ id: 'f', kind: 'pto-solenoid-open', target: 'pto-sol', severity: 1 }] });
    startAndEngage(m);
    expect(m.pto.state).toBe('disengaged');
    expect(readMultimeter(m, 'pto-sol', 'voltage').value).toBeGreaterThan(13);
    expect(readMultimeter(m, 'pto-sol', 'resistance').valid).toBe(false);
    m.setPtoSwitch(false);
    expect(readMultimeter(m, 'pto-sol', 'resistance').display).toBe('OL');
  });

  it('healthy coil reads its rated resistance with the circuit off', () => {
    const m = truck();
    expect(readMultimeter(m, 'pto-sol', 'resistance').value).toBeCloseTo(6.0, 0);
  });

  it('corroded raise-solenoid connector drops voltage below pull-in', () => {
    const m = truck({ faults: [{ id: 'f', kind: 'wiring-high-resistance', target: 'raise-sol', severity: 1 }] });
    startAndEngage(m);
    m.setHoist(1);
    m.advance(0.5);
    const v = readMultimeter(m, 'raise-sol', 'voltage').value;
    expect(v).toBeLessThan(8.5);
    expect(m.sim.getInput('dcv', 'command')).toBe(0);
  });

  it('PTO coupling failure: PTO engaged but pump shaft not turning', () => {
    const m = truck({ faults: [{ id: 'f', kind: 'pto-coupling-failure', target: 'pto', severity: 1 }] });
    startAndEngage(m);
    expect(m.pto.state).toBe('engaged');
    expect(readTach(m, 'pto')).toBeGreaterThan(800);
    expect(readTach(m, 'pump')).toBe(0);
  });
});

describe('observations are derived from simulation state', () => {
  it('pin-hole leak is only visible while the line is pressurised', () => {
    const m = truck({ faults: [{ id: 'f', kind: 'hose-pinhole', target: 'work', severity: 1 }] });
    const before = observe(m, { connections: ['work'] });
    expect(before.some((o) => o.id === 'work-pin')).toBe(false);
    startAndEngage(m);
    m.setHoist(1);
    m.advance(5);
    const during = observe(m, { connections: ['work'] });
    expect(during.find((o) => o.id === 'work-pin')?.safety).toMatch(/cardboard/);
  });

  it('cylinder bypass shows at the breather; observations never name the fault', () => {
    const m = truck({ faults: [{ id: 'f', kind: 'cyl-seal-bypass', target: 'cyl', severity: 0.6 }] });
    startAndEngage(m);
    m.setThrottle(0.35);
    m.setHoist(1);
    m.advance(8);
    m.setHoist(0);
    m.advance(5);
    const obs = observe(m, { components: ['cyl'] });
    expect(obs.some((o) => o.id === 'cyl-breather')).toBe(true);
    expect(obs.some((o) => o.id === 'cyl-drift')).toBe(true);
    expect(obs.map((o) => o.text).join(' ')).not.toMatch(/bypass|seal failure/i);
  });

  it('fluid sample reflects contamination and wrong grade', () => {
    const m = truck({ fluid: { contamination: 22, grade: 'sae-15w40' } });
    const s = takeFluidSample(m);
    expect(s.gradeMatchesSpec).toBe(false);
    expect(s.isoCode).toBe('24/22/19');
    expect(s.viscosity40).toBeGreaterThan(s.specifiedViscosity40 * 1.5);
  });
});

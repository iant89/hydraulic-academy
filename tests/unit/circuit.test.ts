import { describe, expect, it } from 'vitest';
import { BAR, LPM, circleArea } from '@/simulation/core/units';
import { HydraulicSimulation } from '@/simulation/hydraulics/simulation';
import { basicCylinderCircuit } from '@/simulation/circuits/library';

function sim(faults: ConstructorParameters<typeof HydraulicSimulation>[1] = {}) {
  return new HydraulicSimulation(basicCylinderCircuit(), { seed: 1, ...faults });
}

describe('circuit simulation – basic double-acting circuit', () => {
  it('neutral tandem centre unloads the pump at low pressure', () => {
    const s = sim();
    s.run(1);
    expect(s.pressureAt('pump', 'OUT')).toBeLessThan(6 * BAR);
    expect(s.readout('pump', 'flow') / LPM).toBeCloseTo(24 * 0.99, 0);
  });

  it('extends at v = Q/A with pressure set by the load (F/A)', () => {
    const s = sim();
    s.setInput('dcv', 'command', 1);
    s.run(1.5);
    const v = s.readout('cyl', 'velocity');
    const q = s.readout('pump', 'flow');
    expect(v).toBeCloseTo(q / circleArea(0.063), 2);
    const pA = s.pressureAt('cyl', 'A');
    expect(pA).toBeGreaterThan(10000 / circleArea(0.063));
    expect(pA).toBeLessThan(10000 / circleArea(0.063) + 15 * BAR);
  });

  it('relief valve limits pressure at end of stroke', () => {
    const s = sim();
    s.setInput('dcv', 'command', 1);
    s.run(6);
    expect(s.readout('cyl', 'extension')).toBeCloseTo(1, 3);
    const p = s.pressureAt('pump', 'OUT');
    expect(p).toBeGreaterThan(140 * BAR);
    expect(p).toBeLessThan(152 * BAR);
    expect(s.readout('relief', 'flow')).toBeGreaterThan(0.9 * s.readout('pump', 'flow'));
  });

  it('relief flow heats the fluid', () => {
    const s = sim();
    s.setInput('dcv', 'command', 1);
    s.run(6);
    const t0 = s.fluidState.temperature;
    s.run(10);
    expect(s.fluidState.temperature).toBeGreaterThan(t0 + 0.3);
  });

  it('conserves fluid volume between reservoir and cylinder', () => {
    const s = sim();
    const v0 = s.readout('tank', 'volume');
    s.setInput('dcv', 'command', 1);
    s.run(2);
    const x = s.readout('cyl', 'position');
    const swept = circleArea(0.063) * x - (circleArea(0.063) - circleArea(0.036)) * x;
    expect(v0 - s.readout('tank', 'volume')).toBeCloseTo(swept, 4);
  });

  it('holds a load in neutral', () => {
    const s = sim();
    s.setInput('dcv', 'command', 1);
    s.run(1.5);
    s.setInput('dcv', 'command', 0);
    s.run(1);
    const x = s.readout('cyl', 'position');
    s.run(20);
    // Spool valves leak slightly across the lands: a small, bounded settle is physical.
    expect(Math.abs(s.readout('cyl', 'position') - x)).toBeLessThan(0.004);
  });

  it('is deterministic for identical inputs', () => {
    const run = () => {
      const s = sim();
      s.setInput('dcv', 'command', 1);
      s.run(3);
      return [s.pressureAt('pump', 'OUT'), s.readout('cyl', 'position'), s.fluidState.temperature];
    };
    expect(run()).toEqual(run());
  });

  it('snapshot/restore reproduces the same trajectory', () => {
    const s = sim();
    s.setInput('dcv', 'command', 1);
    s.run(1);
    const snap = s.snapshot();
    s.run(2);
    const a = s.readout('cyl', 'position');
    s.restore(snap);
    s.run(2);
    expect(s.readout('cyl', 'position')).toBeCloseTo(a, 9);
  });
});

describe('fault propagation', () => {
  it('relief stuck open prevents pressure build-up and bypasses flow', () => {
    const s = sim({ faults: [{ id: 'f', kind: 'relief-stuck-open', target: 'relief', severity: 0.6 }] });
    s.setInput('dcv', 'command', 1);
    s.run(6);
    expect(s.pressureAt('pump', 'OUT')).toBeLessThan(40 * BAR);
    expect(s.readout('relief', 'flow')).toBeGreaterThan(0.5 * s.readout('pump', 'flow'));
  });

  it('restricted suction lowers inlet pressure and causes cavitation', () => {
    const s = sim({ faults: [{ id: 'f', kind: 'suction-collapsed', target: 'suction', severity: 0.85 }], initialTemperature: 0, ambient: 0 });
    s.setInput('pump', 'speed', 2500);
    s.run(1);
    expect(s.pressureAt('pump', 'IN')).toBeLessThan(-0.2 * BAR);
    expect(s.readout('pump', 'cavitating')).toBe(1);
  });

  it('worn pump loses more flow at higher pressure', () => {
    const s = sim({ faults: [{ id: 'f', kind: 'pump-wear', target: 'pump', severity: 0.8 }], initialTemperature: 50, ambient: 50 });
    s.run(1);
    const qLow = s.readout('pump', 'flow');
    s.setInput('dcv', 'command', 1);
    s.run(6);
    const qHigh = s.readout('pump', 'flow');
    expect(qHigh).toBeLessThan(qLow * 0.8);
  });

  it('internal cylinder bypass causes drift in hold', () => {
    const s = sim({ faults: [{ id: 'f', kind: 'cyl-seal-bypass', target: 'cyl', severity: 1 }] });
    s.setInput('dcv', 'command', 1);
    s.run(1.5);
    s.setInput('dcv', 'command', 0);
    s.run(1);
    const x = s.readout('cyl', 'position');
    s.run(10);
    expect(x - s.readout("cyl", "position")).toBeGreaterThan(0.002);
  });

  it('external pin-hole leak loses fluid to atmosphere only under pressure', () => {
    const s = sim({ faults: [{ id: 'f', kind: 'hose-pinhole', target: 'work-a', severity: 1 }] });
    s.run(2);
    expect(s.externalLoss).toBeLessThan(1e-6);
    s.setInput('dcv', 'command', 1);
    s.run(6);
    expect(s.externalLoss).toBeGreaterThan(1e-5);
  });

  it('relief stuck closed leads to hose burst (secondary damage)', () => {
    const s = sim({ faults: [{ id: 'f', kind: 'relief-stuck-closed', target: 'relief', severity: 1 }] });
    s.setInput('dcv', 'command', 1);
    s.run(8);
    expect(s.events.some((e) => e.code === 'hose-burst')).toBe(true);
    expect(s.faults.faults.some((f) => f.spec.induced && f.spec.kind === 'hose-rupture')).toBe(true);
  });

  it('progressive faults worsen with operating time', () => {
    const s = sim({ faults: [{ id: 'f', kind: 'pump-wear', target: 'pump', severity: 0.1, progressionPerHour: 360 }] });
    s.run(2);
    expect(s.faults.faults[0]!.severity).toBeGreaterThan(0.25);
  });

  it('temperature-activated faults only appear when hot', () => {
    const s = sim({ faults: [{ id: 'f', kind: 'relief-stuck-open', target: 'relief', severity: 1, activation: { type: 'temperature', above: 50 } }] });
    s.setInput('dcv', 'command', 1);
    s.run(6);
    expect(s.pressureAt('pump', 'OUT')).toBeGreaterThan(140 * BAR);
    s.fluidState.temperature = 60;
    s.run(1);
    expect(s.pressureAt('pump', 'OUT')).toBeLessThan(20 * BAR);
  });
});

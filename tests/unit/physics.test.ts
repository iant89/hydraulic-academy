import { describe, expect, it } from 'vitest';
import { BAR, LPM, CC, PSI, GPM, circleArea, toDisplay, fromDisplay, formatQuantity } from '@/simulation/core/units';
import { pressureFromForce, forceFromPressure, pumpFlow, cylinderVelocity, hydraulicPower, pumpTorque, pascalOutputForce } from '@/simulation/physics/formulas';
import { FLUID_GRADES, kinematicViscosityCSt } from '@/simulation/physics/fluid';
import { lineFlow, orificeFlow } from '@/simulation/physics/flow';
import { solveDense } from '@/simulation/core/linalg';
import { Rng } from '@/simulation/core/rng';

describe('hydraulic formulas', () => {
  it('P = F / A and F = P × A are inverse', () => {
    const A = circleArea(0.1); // 100 mm bore
    const p = pressureFromForce(100_000, A);
    expect(p / BAR).toBeCloseTo(127.3, 1);
    expect(forceFromPressure(p, A)).toBeCloseTo(100_000, 6);
  });
  it('Q = Vd × n × ηv', () => {
    expect(pumpFlow(70 * CC, 1500) / LPM).toBeCloseTo(105, 6);
    expect(pumpFlow(70 * CC, 1500, 0.9) / LPM).toBeCloseTo(94.5, 6);
  });
  it('v = Q / A', () => {
    expect(cylinderVelocity(60 * LPM, circleArea(0.08))).toBeCloseTo(0.1989, 3);
  });
  it('hydraulic power and torque', () => {
    expect(hydraulicPower(200 * BAR, 100 * LPM)).toBeCloseTo(33_333, 0);
    expect(pumpTorque(100 * CC, 200 * BAR, 1)).toBeCloseTo(318.3, 1);
  });
  it('Pascal force multiplication', () => {
    expect(pascalOutputForce(100, 1e-4, 1e-2)).toBeCloseTo(10_000, 6);
  });
});

describe('units', () => {
  it('converts pressure and flow', () => {
    expect(toDisplay(BAR, 'pressure', 'imperial')).toBeCloseTo(14.5038, 3);
    expect(fromDisplay(1, 'flow', 'imperial')).toBeCloseTo(GPM, 12);
    expect(toDisplay(100, 'temperature', 'imperial')).toBeCloseTo(212, 6);
    expect(formatQuantity(172 * BAR, 'pressure', 'metric')).toBe('172.0 bar');
    expect(PSI).toBeGreaterThan(6894);
  });
});

describe('fluid properties', () => {
  it('reproduces the ISO VG reference points', () => {
    const g = FLUID_GRADES['iso-vg-46']!;
    expect(kinematicViscosityCSt(g, 40)).toBeCloseTo(46, 0);
    expect(kinematicViscosityCSt(g, 100)).toBeCloseTo(6.8, 0);
    expect(kinematicViscosityCSt(g, 0)).toBeGreaterThan(400);
  });
});

describe('flow relations', () => {
  it('orifice flow is antisymmetric and grows with √Δp', () => {
    const q1 = orificeFlow(1e-5, 50 * BAR, 870);
    const q2 = orificeFlow(1e-5, 200 * BAR, 870);
    expect(orificeFlow(1e-5, -50 * BAR, 870)).toBeCloseTo(-q1, 12);
    expect(q2 / q1).toBeCloseTo(2, 1);
  });
  it('line flow satisfies Δp = RQ + KQ|Q|', () => {
    const R = 1e8;
    const K = 1e13;
    const q = lineFlow(5 * BAR, R, K);
    expect(R * q + K * q * Math.abs(q)).toBeCloseTo(5 * BAR, 3);
  });
});

describe('numerics', () => {
  it('solves a dense system', () => {
    const A = new Float64Array([2, 1, 1, 3]);
    const x = solveDense(A, new Float64Array([3, 5]), 2)!;
    expect(x[0]).toBeCloseTo(0.8, 10);
    expect(x[1]).toBeCloseTo(1.4, 10);
  });
  it('rng is deterministic and serialisable', () => {
    const a = new Rng(42);
    const seq = [a.next(), a.next(), a.next()];
    const b = new Rng(42);
    expect([b.next(), b.next(), b.next()]).toEqual(seq);
    const s = a.getState();
    const v = a.next();
    a.setState(s);
    expect(a.next()).toBe(v);
  });
});

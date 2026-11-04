import { BAR, LPM, clamp } from '../core/units';
import type { MachineSimulation } from '../machine/machine';
import { FLUID_GRADES, kinematicViscosityCSt } from '../physics/fluid';

/**
 * Diagnostic instruments. Every reading is derived from the live
 * simulation state – nothing here knows which fault is present.
 */
export interface GaugeSpec {
  id: string;
  label: string;
  /** Full scale (Pa). Exceeding 110 % damages the gauge. */
  range: number;
  min: number;
  compound?: boolean;
}

export const GAUGES: GaugeSpec[] = [
  { id: 'g-compound', label: 'Compound gauge −1…+10 bar (suction)', range: 10 * BAR, min: -1 * BAR, compound: true },
  { id: 'g-60', label: '0–60 bar gauge (return / low pressure)', range: 60 * BAR, min: 0 },
  { id: 'g-250', label: '0–250 bar gauge', range: 250 * BAR, min: 0 },
  { id: 'g-400', label: '0–400 bar gauge', range: 400 * BAR, min: 0 },
  { id: 'g-600', label: '0–600 bar gauge', range: 600 * BAR, min: 0 },
];

/** Needle fluctuation from aeration/cavitation (deterministic in sim time). */
export function pulsation(m: MachineSimulation, p: number): number {
  const pump = m.sim.readouts(m.def.pump);
  const cav = pump.find((r) => r.key === 'cavitating')?.value === true;
  const air = m.sim.fluidState.airFraction;
  const amp = (air * 4 + (cav ? 0.06 : 0)) * Math.max(Math.abs(p), 5 * BAR);
  const t = m.sim.time;
  return amp * (0.6 * Math.sin(2 * Math.PI * 6.3 * t) + 0.4 * Math.sin(2 * Math.PI * 17.1 * t + 1.3));
}

export interface GaugeReading {
  testPoint: string;
  gauge: string;
  value: number;
  pegged: boolean;
  damaged: boolean;
  belowRange: boolean;
}

export function readGauge(m: MachineSimulation, testPointId: string, gauge: GaugeSpec): GaugeReading {
  const tp = m.def.testPoints.find((t) => t.id === testPointId);
  if (!tp) throw new Error(`Unknown test point ${testPointId}`);
  const p = m.sim.pressureAt(tp.component, tp.port);
  const raw = Number.isFinite(p) ? p + pulsation(m, p) : 0;
  const pegged = raw > gauge.range;
  const damaged = raw > gauge.range * 1.1;
  return { testPoint: testPointId, gauge: gauge.id, value: clamp(raw, gauge.min, gauge.range * 1.05), pegged, damaged, belowRange: raw < gauge.min };
}

export function readFlowTester(m: MachineSimulation) {
  if (!m.sim.components.has('flow-tester')) return null;
  return {
    flow: m.sim.readout('flow-tester', 'flow'),
    pressure: m.sim.readout('flow-tester', 'pressure'),
    temperature: m.sim.fluidState.temperature,
    load: m.sim.getInput('flow-tester', 'load'),
  };
}

export function setFlowTesterLoad(m: MachineSimulation, closure: number) {
  if (m.sim.components.has('flow-tester')) m.sim.setInput('flow-tester', 'load', clamp(closure, 0, 1));
}

/** Optical tachometer / strobe reading (rpm). */
export function readTach(m: MachineSimulation, target: 'engine' | 'pto' | 'pump'): number {
  if (target === 'engine') return m.engineRpm;
  if (target === 'pto') return m.pto.outputRpm;
  return Math.abs(m.sim.getInput(m.def.pump, 'speed')) || 0;
}

export type MeterMode = 'voltage' | 'resistance';
export interface MeterReading {
  mode: MeterMode;
  value: number;
  display: string;
  valid: boolean;
  note: string;
}

export function readMultimeter(m: MachineSimulation, circuitId: string, mode: MeterMode): MeterReading {
  const c = m.electrical().find((e) => e.id === circuitId);
  if (!c) throw new Error(`Unknown circuit ${circuitId}`);
  if (mode === 'voltage') {
    return { mode, value: c.voltage, display: `${c.voltage.toFixed(2)} V`, valid: true, note: `Back-probed at ${c.connector}${c.energised ? ' with control ON' : ' (circuit not energised)'}.` };
  }
  if (c.energised) {
    return { mode, value: NaN, display: '----', valid: false, note: 'Invalid: never measure resistance on a live circuit. Switch the control OFF and unplug the connector.' };
  }
  const r = c.coilResistance;
  return { mode, value: r, display: Number.isFinite(r) ? `${r.toFixed(1)} Ω` : 'OL', valid: true, note: `Measured across the coil terminals with ${c.connector} unplugged.` };
}

/** Infrared surface temperature (°C). Local heating from dissipation in a component. */
export function readIrTemperature(m: MachineSimulation, componentId: string): number {
  const T = m.sim.fluidState.temperature;
  const comp = m.sim.components.get(componentId);
  if (!comp) return m.sim.ambient;
  let local = 0;
  if (comp.type === 'relief-valve') {
    const q = m.sim.readout(componentId, 'flow');
    const p = m.sim.readout(componentId, 'inlet');
    local = clamp((q * p) / 120, 0, 70);
  } else if (comp.type.startsWith('pump')) {
    local = clamp((comp.extraHeat?.(m.sim.env()) ?? 0) / 160, 0, 40);
  } else if (comp.type === 'cylinder') {
    local = -4;
  }
  return Math.max(m.sim.ambient, T + local);
}

export interface FluidSampleResult {
  isoCode: string;
  contaminationIndex: number;
  waterPpm: number;
  appearance: string[];
  viscosity40: number;
  specifiedViscosity40: number;
  gradeMatchesSpec: boolean;
  wearDebris: 'none' | 'trace' | 'moderate' | 'heavy';
  aeration: 'none' | 'slight' | 'foamy';
}

export function takeFluidSample(m: MachineSimulation): FluidSampleResult {
  const fs = m.sim.fluidState;
  const grade = FLUID_GRADES[fs.grade] ?? FLUID_GRADES['iso-vg-46']!;
  const spec = FLUID_GRADES[m.circuit.specifiedFluidGrade ?? m.circuit.fluidGrade] ?? grade;
  const c = Math.round(fs.contamination);
  const appearance: string[] = [];
  if (fs.water > 1000) appearance.push('Milky / hazy (free water)');
  if (fs.contamination > 20) appearance.push('Dark with visible particles');
  if (fs.airFraction > 0.02) appearance.push('Foamy – bubbles slow to clear');
  if (fs.wearDebris > 0.15) appearance.push('Metallic glitter visible under light');
  if (appearance.length === 0) appearance.push('Clear and bright, amber');
  return {
    isoCode: `${c + 2}/${c}/${c - 3}`,
    contaminationIndex: fs.contamination,
    waterPpm: fs.water,
    appearance,
    viscosity40: kinematicViscosityCSt(grade, 40),
    specifiedViscosity40: kinematicViscosityCSt(spec, 40),
    gradeMatchesSpec: grade.id === spec.id,
    wearDebris: fs.wearDebris > 0.4 ? 'heavy' : fs.wearDebris > 0.15 ? 'moderate' : fs.wearDebris > 0.03 ? 'trace' : 'none',
    aeration: fs.airFraction > 0.03 ? 'foamy' : fs.airFraction > 0.008 ? 'slight' : 'none',
  };
}

export function readSightGlass(m: MachineSimulation, reservoirId = 'tank') {
  const level = m.sim.readout(reservoirId, 'level');
  const below = m.sim.readout(reservoirId, 'belowMin') === 1;
  return { level, belowMin: below, volume: m.sim.readout(reservoirId, 'volume'), foamy: m.sim.fluidState.airFraction > 0.02 };
}

/** Rate of change of hoist extension in mm/min (negative = settling). */
export class DriftMeter {
  private start: { t: number; x: number } | null = null;
  private pos(m: MachineSimulation, id: string) {
    const c = m.sim.components.get(id);
    if (!c) return 0;
    return c.type === 'motor' ? (c.getState().angle ?? 0) / 1000 : m.sim.readout(id, 'position');
  }
  /** Cylinders: mm; motors: degrees of shaft rotation (reported in the same fields). */
  begin(m: MachineSimulation, actuator: string) {
    this.start = { t: m.time, x: this.pos(m, actuator) };
  }
  read(m: MachineSimulation, actuator: string) {
    if (!this.start) return null;
    const dt = m.time - this.start.t;
    const dx = this.pos(m, actuator) - this.start.x;
    return { elapsed: dt, displacementMm: dx * 1000, rateMmPerMin: dt > 0 ? (dx * 1000 * 60) / dt : 0 };
  }
}

export const toLpm = (q: number) => q / LPM;

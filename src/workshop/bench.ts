import { BAR, LPM } from '@/simulation/core/units';
import { HydraulicSimulation } from '@/simulation/hydraulics/simulation';
import { hose, conn } from '@/simulation/circuits/library';
import type { ComponentInstanceDefinition } from '@/simulation/hydraulics/types';
import type { FaultSpec } from '@/simulation/failures/faults';
import { FAULT_INFO } from '@/simulation/failures/catalog';

/**
 * Test-bench procedures for removed components. Each bench is a small
 * circuit run on the SAME hydraulic simulation engine, with the removed
 * unit's actual condition (faults) carried over.
 */
export interface BenchPoint {
  label: string;
  value: string;
}
export interface BenchResult {
  title: string;
  points: BenchPoint[];
  summary: string;
}

const retarget = (faults: FaultSpec[], id: string) => faults.map((f) => ({ ...f, target: id, activation: undefined }));

export function benchTest(comp: ComponentInstanceDefinition, faults: FaultSpec[], temperature = 50): BenchResult | null {
  if (comp.type.startsWith('pump')) return pumpBench(comp, faults, temperature);
  if (comp.type === 'relief-valve') return reliefBench(comp, faults);
  if (comp.type === 'cylinder') return cylinderBench(comp, faults);
  return null;
}

function pumpBench(comp: ComponentInstanceDefinition, faults: FaultSpec[], temperature: number): BenchResult {
  const pump = { ...structuredClone(comp), id: 'dut', params: { ...comp.params, speed: 1500 } };
  const rot = comp.params.rotation === 'cw' ? 1 : -1;
  const sim = new HydraulicSimulation(
    {
      id: 'bench-pump',
      name: 'Pump test bench',
      fluidGrade: 'iso-vg-46',
      components: [
        { id: 'tank', type: 'reservoir', label: 'Bench tank', params: { capacity: 200, initialVolume: 180, height: 0.8 } },
        pump,
        { id: 'ft', type: 'flow-meter', label: 'Bench flow meter', params: { load: 0 } },
      ],
      connections: [
        conn('s', 'tank.S', 'dut.IN', 'suction', hose(50.8, 0.5, 10, 'suction-hose')),
        conn('p', 'dut.OUT', 'ft.IN', 'pressure', hose(25.4, 1, 400)),
        conn('r', 'ft.OUT', 'tank.R', 'return', hose(31.75, 1, 400)),
      ],
    },
    { faults: retarget(faults, 'dut'), initialTemperature: temperature, ambient: temperature, ambientLoss: 1e6 },
  );
  sim.setInput('dut', 'driveRotation', rot);
  const points: BenchPoint[] = [];
  const flows: number[] = [];
  // The bench operator closes the load valve until each target test pressure is reached.
  let load = 0;
  for (const target of [0, 70, 140, 170]) {
    for (let i = 0; i < 80 && target > 0; i++) {
      sim.setInput('ft', 'load', load);
      sim.run(0.05);
      const err = (target * BAR - sim.readout('ft', 'pressure')) / (200 * BAR);
      if (Math.abs(err) < 0.004) break;
      load = Math.min(0.995, Math.max(0, load + err * 0.25));
    }
    sim.setInput('ft', 'load', load);
    sim.run(0.5);
    const p = sim.readout('ft', 'pressure');
    const q = sim.readout('ft', 'flow');
    flows.push(q);
    points.push({ label: `${(p / BAR).toFixed(0)} bar`, value: `${(q / LPM).toFixed(1)} L/min` });
  }
  const theo = ((Number(comp.params.displacement) || 50) * 1e-6 * 1500) / 60;
  const eff = flows[flows.length - 1]! / theo;
  return {
    title: `Pump bench test @1500 rpm, ${temperature} °C`,
    points,
    summary: `Theoretical ${(theo / LPM).toFixed(1)} L/min. Volumetric efficiency at highest test pressure ≈ ${(eff * 100).toFixed(0)} %.`,
  };
}

function reliefBench(comp: ComponentInstanceDefinition, faults: FaultSpec[]): BenchResult {
  const dut = { ...structuredClone(comp), id: 'dut' };
  const sim = new HydraulicSimulation(
    {
      id: 'bench-relief',
      name: 'Relief valve test stand',
      fluidGrade: 'iso-vg-46',
      components: [
        { id: 'tank', type: 'reservoir', label: 'Stand tank', params: { capacity: 100, initialVolume: 90, height: 0.6 } },
        { id: 'hp', type: 'pump-gear', label: 'Stand pump', params: { displacement: 4, speed: 0, ratedSpeed: 3000, maxPressure: 400 } },
        dut,
        { id: 'g', type: 'gauge', label: 'Stand gauge', params: {} },
      ],
      connections: [
        conn('s', 'tank.S', 'hp.IN', 'suction', hose(19, 0.5, 10, 'suction-hose')),
        conn('p', 'hp.OUT', 'dut.P', 'pressure', hose(9.5, 1, 700)),
        conn('g', 'hp.OUT', 'g.G', 'pressure', hose(6, 0.3, 700)),
        conn('r', 'dut.T', 'tank.R', 'return', hose(12.7, 1, 700)),
      ],
    },
    { faults: retarget(faults, 'dut'), initialTemperature: 40, ambient: 40 },
  );
  const points: BenchPoint[] = [];
  let maxP = 0;
  for (const rpm of [300, 800, 1500]) {
    sim.setInput('hp', 'speed', rpm);
    sim.run(1.5);
    const p = sim.readout('g', 'pressure');
    maxP = Math.max(maxP, p);
    points.push({ label: `${((4e-6 * rpm) / 60 / LPM).toFixed(1)} L/min`, value: Number.isFinite(p) && p < 390 * BAR ? `${(p / BAR).toFixed(0)} bar` : '> 390 bar (stand limit – valve did not open)' });
  }
  const crack = points[0]!.value;
  return { title: 'Relief valve cracking test (stand)', points, summary: maxP > 390 * BAR ? 'Valve did not relieve within the stand limit – seized closed.' : `Opening pressure at low flow: ${crack}.` };
}

function cylinderBench(comp: ComponentInstanceDefinition, faults: FaultSpec[]): BenchResult {
  const bypass = faults.find((f) => f.kind === 'cyl-seal-bypass')?.severity ?? 0;
  const rod = faults.find((f) => f.kind === 'cyl-rod-seal-leak')?.severity ?? 0;
  const dut = { ...structuredClone(comp), id: 'dut', params: { ...comp.params, initialPosition: 0.5, externalLoad: 0 } };
  const sim = new HydraulicSimulation(
    {
      id: 'bench-cyl',
      name: 'Cylinder leak test',
      fluidGrade: 'iso-vg-46',
      components: [
        { id: 'tank', type: 'reservoir', label: 'Stand tank', params: { capacity: 100, initialVolume: 90, height: 0.6 } },
        { id: 'hp', type: 'pump-gear', label: 'Stand pump', params: { displacement: 2, speed: 300, ratedSpeed: 3000 } },
        { id: 'rv', type: 'relief-valve', label: 'Stand relief', params: { crackingPressure: 100, ratedFlow: 10 } },
        dut,
      ],
      connections: [
        conn('s', 'tank.S', 'hp.IN', 'suction', hose(19, 0.5, 10, 'suction-hose')),
        conn('p', 'hp.OUT', 'dut.A', 'pressure', hose(9.5, 1, 400)),
        conn('rv', 'hp.OUT', 'rv.P', 'pressure', hose(9.5, 0.3, 400)),
        conn('r', 'rv.T', 'tank.R', 'return', hose(12.7, 1, 400)),
      ],
    },
    { faults: retarget(faults, 'dut'), initialTemperature: 40, ambient: 40 },
  );
  sim.setInput('dut', 'externalForce', 1e7); // blocked rod – stage held mechanically
  sim.run(3);
  const leakBreather = sim.leakRate['dut:bypass'] ?? 0;
  const leakGland = sim.leakRate['dut:rodseal'] ?? 0;
  return {
    title: 'Static leak test at 100 bar (stage blocked)',
    points: [
      { label: 'Breather discharge', value: `${(leakBreather / LPM * 1000).toFixed(0)} mL/min` },
      { label: 'Gland leakage', value: `${(leakGland / LPM * 1000).toFixed(0)} mL/min` },
    ],
    summary: bypass > 0.05 || rod > 0.05 ? 'Leakage exceeds acceptable seepage – seals require replacement.' : 'No measurable leakage – seals serviceable.',
  };
}

/** Visual findings on a removed component, derived from its actual condition. */
export function inspectRemoved(comp: ComponentInstanceDefinition, faults: FaultSpec[]): string[] {
  const out: string[] = [];
  const text: Record<string, string> = {
    'pump-wear': 'Side plates scored; heavy wear track on the housing inlet side; gear tip clearance excessive.',
    'pump-gear-damage': 'Several gear teeth chipped; metallic debris in the housing; bushings scored.',
    'pump-shaft-sheared': 'Drive shaft sheared at the spline relief groove.',
    'relief-stuck-open': 'Debris lodged between poppet and seat; seat eroded.',
    'relief-stuck-closed': 'Poppet seized in its bore – varnish and scoring; will not move by hand.',
    'relief-seat-leak': 'Seat face pitted and eroded.',
    'spool-stuck': 'Spool shows varnish and fine scoring; binds in the bore.',
    'dcv-internal-leak': 'Spool lands rounded; bore wear ring visible.',
    'cyl-seal-bypass': 'Stage seals hardened and torn; scoring on stage bores.',
    'cyl-rod-seal-leak': 'Gland wiper and rod seal torn.',
    'cyl-bent-rod': 'Stage run-out measured well beyond acceptable limits.',
    'cyl-binding': 'Mount bushings worn oval; galling on pins.',
    'filter-clogged': 'Element heavily loaded with dark sludge; pleats bridged.',
  };
  for (const f of faults) out.push(text[f.kind] ?? `${FAULT_INFO.get(f.kind)?.label ?? f.kind} evident.`);
  if (!out.length) out.push(`${comp.label}: no abnormal wear, damage or contamination found – component appears serviceable.`);
  return out;
}

import { create } from 'zustand';
import { MachineSimulation } from '@/simulation/machine/machine';
import { DiagnosticSession } from '@/simulation/scenarios/session';
import { DriftMeter, GAUGES, type GaugeSpec } from '@/simulation/sensors/instruments';
import type { DiagnosticScenario } from '@/simulation/scenarios/types';
import type { EquipmentProfile } from '@/equipment/shared/types';
import { machineFromProfile } from '@/equipment/registry';
import { BUILTIN_PROFILES } from '@/data/equipment/profiles';
import type { FaultSpec } from '@/simulation/failures/faults';
import { SCENARIO_PROFILE } from '@/data/scenarios';

/**
 * The single live equipment runtime shared by the Equipment Simulator,
 * Virtual Workshop, Repair Workshop and Diagnostic Center. A repair made in
 * the workshop is therefore the same state the simulator operates.
 */
export interface InstalledGauge {
  testPoint: string;
  gauge: GaugeSpec;
  damaged?: boolean;
}

export interface Measurement {
  t: number;
  tool: string;
  point: string;
  value: string;
}

interface WorkbayState {
  profile: EquipmentProfile;
  machine: MachineSimulation;
  session: DiagnosticSession | null;
  scenario: DiagnosticScenario | null;
  running: boolean;
  timeScale: number;
  tick: number;
  gauges: InstalledGauge[];
  drift: DriftMeter;
  practiceFaults: FaultSpec[];
  measurements: Measurement[];
  addMeasurement(tool: string, point: string, value: string, testId?: string): void;
  markGaugeDamaged(tp: string): void;
  loadProfile(p: EquipmentProfile): void;
  startScenario(s: DiagnosticScenario): void;
  endScenario(): void;
  reset(): void;
  setRunning(r: boolean): void;
  setTimeScale(t: number): void;
  bump(): void;
  installGauge(tp: string, gaugeId: string): void;
  removeGauge(tp: string): void;
  injectFault(f: FaultSpec): void;
  clearPracticeFaults(): void;
}

const fresh = (p: EquipmentProfile, faults: FaultSpec[] = []) => new MachineSimulation(machineFromProfile(p), { seed: 11, faults: structuredClone(faults), initialTemperature: 25 });

export const useWorkbay = create<WorkbayState>((set, get) => ({
  profile: BUILTIN_PROFILES[0]!,
  machine: fresh(BUILTIN_PROFILES[0]!),
  session: null,
  scenario: null,
  running: true,
  timeScale: 1,
  tick: 0,
  gauges: [],
  drift: new DriftMeter(),
  practiceFaults: [],
  measurements: [],
  addMeasurement(tool, point, value, testId) {
    const m = get().machine;
    set({ measurements: [{ t: m.time, tool, point, value }, ...get().measurements].slice(0, 200) });
    if (testId) get().session?.record('test', testId, `${tool} @ ${point}: ${value}`);
  },
  markGaugeDamaged(tp) {
    set({ gauges: get().gauges.map((g) => (g.testPoint === tp ? { ...g, damaged: true } : g)) });
    get().machine.log('alarm', tp, 'gauge-overrange', `Gauge at ${tp} over-ranged and damaged – always fit a gauge rated above the maximum expected pressure.`);
  },
  loadProfile(p) {
    set({ profile: p, machine: fresh(p), session: null, scenario: null, gauges: [], practiceFaults: [], measurements: [], tick: get().tick + 1 });
  },
  startScenario(s) {
    // Scenarios are authored for a specific equipment profile.
    const p = BUILTIN_PROFILES.find((x) => x.id === SCENARIO_PROFILE[s.brief.equipmentId]) ?? BUILTIN_PROFILES[0]!;
    const session = new DiagnosticSession(machineFromProfile(p), s);
    set({ profile: p, session, scenario: s, machine: session.machine, gauges: [], practiceFaults: [], measurements: [], running: true, tick: get().tick + 1 });
  },
  endScenario() {
    set({ session: null, scenario: null, machine: fresh(get().profile), gauges: [], tick: get().tick + 1 });
  },
  reset() {
    const s = get().scenario;
    if (s) get().startScenario(s);
    else set({ machine: fresh(get().profile, get().practiceFaults), gauges: [], tick: get().tick + 1 });
  },
  setRunning: (running) => set({ running }),
  setTimeScale: (timeScale) => set({ timeScale }),
  bump: () => set({ tick: get().tick + 1 }),
  installGauge(tp, gaugeId) {
    const gauge = GAUGES.find((g) => g.id === gaugeId)!;
    set({ gauges: [...get().gauges.filter((g) => g.testPoint !== tp), { testPoint: tp, gauge }] });
    get().session?.record('test', `gauge:${tp}`, `Installed ${gauge.label} at ${tp}`);
  },
  removeGauge(tp) {
    set({ gauges: get().gauges.filter((g) => g.testPoint !== tp) });
  },
  injectFault(f) {
    get().machine.sim.faults.add(structuredClone(f));
    set({ practiceFaults: [...get().practiceFaults, f], tick: get().tick + 1 });
  },
  clearPracticeFaults() {
    set({ practiceFaults: [] });
    get().reset();
  },
}));

export { GAUGES };

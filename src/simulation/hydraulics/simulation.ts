import { Rng, hashSeed } from '../core/rng';
import { BAR, LPM, circleArea, clamp } from '../core/units';
import { FLUID_GRADES, FLUID_CP, fluidProps, type FluidProps } from '../physics/fluid';
import { laminarResistance, lineFlow, orificeFlow, turbulentCoefficient } from '../physics/flow';
import { getModel } from '../components/registry';
import type { BuildCtx } from '../components/base';
import { branch } from '../components/base';
import { FaultManager, type FaultSpec } from '../failures/faults';
import { HydraulicNetwork } from './network';
import type {
  CircuitDefinition,
  ConnectionDefinition,
  FluidState,
  NodeInfo,
  Readout,
  RuntimeComponent,
  SimEvent,
  StepEnv,
} from './types';

export interface SimulationOptions {
  dt?: number;
  seed?: number;
  ambient?: number;
  initialTemperature?: number;
  faults?: FaultSpec[];
  fluid?: Partial<FluidState>;
  /** Extra heat-loss coefficient to ambient from reservoir & lines (W/K). */
  ambientLoss?: number;
}

export interface SimSnapshot {
  time: number;
  rng: number;
  fluid: FluidState;
  components: Record<string, Record<string, number>>;
  pressures: Record<string, number>;
  faults: ReturnType<FaultManager['getState']>;
  externalLoss: number;
  leakByElement: Record<string, number>;
  definition: CircuitDefinition;
}

interface HoseRuntime {
  def: ConnectionDefinition;
  from: number;
  to: number;
  elementId: string;
  ruptured: boolean;
  overRated: boolean;
}

/**
 * Circuit-level simulation: compiles a CircuitDefinition into a network,
 * advances it with a fixed, deterministic time step and tracks fluid
 * temperature, aeration, contamination, leakage and events.
 *
 * Determinism: no wall-clock or Math.random – all randomness comes from a
 * seeded Rng whose state is part of every snapshot.
 */
export class HydraulicSimulation {
  def!: CircuitDefinition;
  readonly dt: number;
  time = 0;
  network!: HydraulicNetwork;
  components = new Map<string, RuntimeComponent>();
  hoses: HoseRuntime[] = [];
  fluidState: FluidState;
  events: SimEvent[] = [];
  rng: Rng;
  faults: FaultManager;
  ambient: number;
  ambientLoss: number;
  externalLoss = 0;
  leakByElement: Record<string, number> = {};
  /** Instantaneous external leak rate per element (m^3/s) after the last step. */
  leakRate: Record<string, number> = {};
  lastHeatIn = 0;
  lastHeatOut = 0;
  lastSolve = { converged: true, iterations: 0 };
  private envRef: { current: StepEnv };
  private atm = -1;
  private portNodeIndex = new Map<string, number>();
  /** Hook for owners (machines) to run logic between fault update and component pre-step. */
  onBeforeStep?: (sim: HydraulicSimulation) => void;
  /** Listeners run after every completed step (metrics, recorders). */
  afterStep: Array<(sim: HydraulicSimulation) => void> = [];

  constructor(def: CircuitDefinition, opts: SimulationOptions = {}) {
    this.dt = opts.dt ?? 0.01;
    this.rng = new Rng(opts.seed ?? hashSeed(def.id));
    this.ambient = opts.ambient ?? 20;
    this.ambientLoss = opts.ambientLoss ?? 18;
    this.faults = new FaultManager(opts.faults ?? []);
    this.fluidState = {
      temperature: opts.initialTemperature ?? this.ambient,
      airFraction: 0,
      contamination: 16,
      water: 150,
      wearDebris: 0,
      grade: def.fluidGrade,
      ...opts.fluid,
    };
    this.envRef = { current: this.makeEnv() };
    this.build(def);
  }

  // ───────────── construction ─────────────
  private makeEnv(): StepEnv {
    const self = this;
    return {
      dt: this.dt,
      time: this.time,
      fluid: this.props(),
      fluidState: this.fluidState,
      faults: this.faults,
      rng: this.rng,
      ambient: this.ambient,
      pressure: (n) => self.network.p[n] ?? 0,
      inflow: (n) => self.network.nodeInflow[n] ?? 0,
      log: (e) => self.log(e),
    };
  }

  props(): FluidProps {
    const grade = FLUID_GRADES[this.fluidState.grade] ?? FLUID_GRADES['iso-vg-46']!;
    const ref = FLUID_GRADES[this.def?.specifiedFluidGrade ?? this.def?.fluidGrade ?? 'iso-vg-46'] ?? grade;
    return fluidProps(grade, this.fluidState.temperature, this.fluidState.airFraction, ref);
  }

  private build(def: CircuitDefinition) {
    this.def = def;
    this.network = new HydraulicNetwork();
    this.components.clear();
    this.hoses = [];
    this.portNodeIndex.clear();
    const net = this.network;
    this.atm = net.addNode({ id: 'ATM', label: 'Atmosphere', volume: 0, boundary: () => 0, kind: 'atmosphere', owner: '' });
    const ctx: BuildCtx = {
      envRef: this.envRef,
      port: (cdef, portId, volume = 0.01e-3) => {
        const key = `${cdef.id}.${portId}`;
        const existing = this.portNodeIndex.get(key);
        if (existing !== undefined) {
          net.nodes[existing]!.volume += volume;
          return existing;
        }
        const idx = net.addNode({ id: key, label: `${cdef.label} ${portId}`, volume, boundary: null, kind: 'port', owner: cdef.id });
        this.portNodeIndex.set(key, idx);
        return idx;
      },
      internal: (owner, label, volume) => net.addNode({ id: `${owner}#${label}`, label, volume, boundary: null, kind: 'internal', owner }),
      boundary: (owner, label, fn, kind = 'tank') => {
        const portId = label.split(' ').pop() ?? label;
        const key = `${owner}.${portId}`;
        const idx = net.addNode({ id: key, label, volume: 0, boundary: fn, kind, owner });
        this.portNodeIndex.set(key, idx);
        return idx;
      },
      atmosphere: () => this.atm,
      nodeInfo: (i) => net.nodes[i]!,
    };
    for (const c of def.components) {
      const model = getModel(c.type);
      const rt = model.build(ctx, c);
      this.components.set(c.id, rt);
      rt.elements.forEach((e) => net.addElement(e));
    }
    for (const conn of def.connections) this.buildHose(conn);
    net.finalize();
  }

  private buildHose(conn: ConnectionDefinition) {
    const net = this.network;
    const fromKey = `${conn.from.component}.${conn.from.port}`;
    const toKey = `${conn.to.component}.${conn.to.port}`;
    const a = this.portNodeIndex.get(fromKey);
    const b = this.portNodeIndex.get(toKey);
    if (a === undefined || b === undefined) {
      this.log({ level: 'warning', source: conn.id, code: 'bad-connection', message: `Connection ${conn.id} references a missing port and was ignored.` });
      return;
    }
    const d = conn.hose.innerDiameter;
    const L = conn.hose.length;
    const vol = circleArea(d) * L;
    const na = net.nodes[a]!;
    const nb = net.nodes[b]!;
    if (!na.boundary) na.volume += vol / 2;
    if (!nb.boundary) nb.volume += vol / 2;
    const env = this.envRef;
    const sev = (k: string) => this.faults.severity(conn.id, k);
    const id = `hose:${conn.id}`;
    net.addElement(
      branch(id, conn.id, conn.label ?? conn.id, a, b, (pa, pb) => {
        const f = env.current.fluid;
        const restrict = Math.max(sev('hose-restricted'), sev('suction-collapsed'));
        const dEff = d * (1 - 0.72 * restrict);
        const R = laminarResistance(f.mu, L, dEff);
        const K = turbulentCoefficient(f.rho, L, dEff);
        return lineFlow(pa - pb, R, K);
      }),
    );
    const leak = (suffix: string, node: number, area: (s: (k: string) => number) => number) =>
      net.addElement(
        branch(`${id}:${suffix}`, conn.id, `${conn.label ?? conn.id} ${suffix}`, node, this.atm, (pa) => {
          const A = area(sev);
          return A > 0 ? orificeFlow(A, Math.max(0, pa), env.current.fluid.rho) : 0;
        }, true, true),
      );
    leak('pinhole', b, (s) => 0.2e-6 * s('hose-pinhole'));
    leak('rupture', a, (s) => circleArea(d) * 0.35 * s('hose-rupture'));
    leak('fitting', b, (s) => 0.12e-6 * s('fitting-loose'));
    this.hoses.push({ def: conn, from: a, to: b, elementId: id, ruptured: false, overRated: false });
  }

  // ───────────── stepping ─────────────
  log(e: Omit<SimEvent, 'time'>) {
    this.events.push({ ...e, time: this.time });
    if (this.events.length > 600) this.events.splice(0, this.events.length - 600);
  }

  maxPressure(): number {
    let m = 0;
    this.network.p.forEach((v) => (m = Math.max(m, v)));
    return m;
  }

  isOperating(): boolean {
    for (const c of this.components.values()) {
      if (c.type.startsWith('pump') && Math.abs(c.inputs.speed ?? 0) > 1) return true;
    }
    return false;
  }

  step() {
    this.faults.update(
      { temperature: this.fluidState.temperature, systemPressure: this.maxPressure(), operating: this.isOperating(), dt: this.dt },
      this.rng,
    );
    this.onBeforeStep?.(this);
    const env = this.envRef.current;
    env.time = this.time;
    env.fluid = this.props();
    env.fluidState = this.fluidState;
    for (const c of this.components.values()) c.preStep?.(env);
    this.lastSolve = this.network.solve(this.dt, env.fluid.beta);
    for (const c of this.components.values()) c.postStep?.(env);
    this.postHoses(env);
    this.updateFluid(env);
    this.time += this.dt;
    for (const l of this.afterStep) l(this);
  }

  run(seconds: number) {
    const n = Math.round(seconds / this.dt);
    for (let i = 0; i < n; i++) this.step();
  }

  private postHoses(env: StepEnv) {
    const net = this.network;
    // External leakage accounting
    this.leakRate = {};
    net.elements.forEach((e, i) => {
      if (!e.external) return;
      const q = Math.max(0, net.elementFlows[i]![1] ?? 0);
      if (q <= 0) return;
      this.leakRate[e.id] = q;
      this.externalLoss += q * this.dt;
      this.leakByElement[e.id] = (this.leakByElement[e.id] ?? 0) + q * this.dt;
    });
    let burstThisStep = false;
    for (const h of this.hoses) {
      const p = Math.max(net.p[h.from]!, net.p[h.to]!);
      const rating = h.def.hose.workingPressure;
      if (p > rating && !h.overRated) {
        h.overRated = true;
        this.log({ level: 'warning', source: h.def.id, code: 'over-rating', message: `${h.def.label ?? h.def.id}: pressure ${(p / BAR).toFixed(0)} bar exceeds hose working rating ${(rating / BAR).toFixed(0)} bar.` });
      } else if (p < rating * 0.95) h.overRated = false;
      if (!h.ruptured && !burstThisStep && p > rating * 4) {
        h.ruptured = true;
        burstThisStep = true;
        this.faults.add({ id: `induced-rupture-${h.def.id}`, kind: 'hose-rupture', target: h.def.id, severity: 1, induced: true });
        this.log({ level: 'alarm', source: h.def.id, code: 'hose-burst', message: `${h.def.label ?? h.def.id} BURST at ${(p / BAR).toFixed(0)} bar (4× working rating). Secondary damage.` });
      }
      // Air drawn in at a loose suction fitting while the line is under vacuum.
      const s = this.faults.severity(h.def.id, 'suction-air-leak');
      if (s > 0) {
        const vac = Math.max(0, -Math.min(net.p[h.from]!, net.p[h.to]!));
        const q = Math.abs(net.throughFlow(h.elementId));
        this.fluidState.airFraction = clamp(this.fluidState.airFraction + s * (0.02 + vac / BAR) * (q / LPM) * 0.0004 * env.dt, 0, 0.3);
      }
    }
  }

  private updateFluid(env: StepEnv) {
    const fs = this.fluidState;
    // Air: released in the reservoir over time.
    const airFault = this.faults.severity('fluid', 'air-entrained');
    if (airFault > 0) fs.airFraction = Math.max(fs.airFraction, 0.05 * airFault);
    fs.airFraction = Math.max(0, fs.airFraction - (fs.airFraction / 90) * env.dt);
    // Thermal balance.
    let heatIn = this.network.dissipation();
    let heatOut = this.ambientLoss * (fs.temperature - this.ambient);
    for (const c of this.components.values()) {
      heatIn += c.extraHeat?.(env) ?? 0;
      heatOut += c.heatRejection?.(env) ?? 0;
    }
    this.lastHeatIn = heatIn;
    this.lastHeatOut = heatOut;
    const vol = this.totalFluidVolume();
    const mass = Math.max(vol, 5e-3) * env.fluid.rho;
    fs.temperature += ((heatIn - heatOut) * env.dt) / (mass * FLUID_CP);
  }

  totalFluidVolume(): number {
    let v = 0;
    for (const c of this.components.values()) if (c.type === 'reservoir') v += c.getState().volume ?? 0;
    for (const h of this.hoses) v += circleArea(h.def.hose.innerDiameter) * h.def.hose.length;
    return v;
  }

  // ───────────── queries ─────────────
  env(): StepEnv {
    return this.envRef.current;
  }

  nodeOf(component: string, port: string): number | undefined {
    return this.portNodeIndex.get(`${component}.${port}`);
  }

  pressureAt(component: string, port: string): number {
    const n = this.nodeOf(component, port);
    return n === undefined ? NaN : this.network.p[n]!;
  }

  /** Flow through a connection from its `from` port to its `to` port (m^3/s). */
  flowThrough(connectionId: string): number {
    return this.network.throughFlow(`hose:${connectionId}`);
  }

  readouts(componentId: string): Readout[] {
    const c = this.components.get(componentId);
    return c ? c.readouts(this.envRef.current) : [];
  }

  readout(componentId: string, key: string): number {
    const r = this.readouts(componentId).find((x) => x.key === key);
    return typeof r?.value === 'number' ? r.value : typeof r?.value === 'boolean' ? (r.value ? 1 : 0) : NaN;
  }

  setInput(componentId: string, key: string, value: number) {
    const c = this.components.get(componentId);
    if (!c) throw new Error(`No component ${componentId}`);
    c.inputs[key] = value;
  }

  getInput(componentId: string, key: string): number {
    return this.components.get(componentId)?.inputs[key] ?? NaN;
  }

  // ───────────── snapshots & rebuild ─────────────
  snapshot(): SimSnapshot {
    const components: SimSnapshot['components'] = {};
    for (const [id, c] of this.components) components[id] = { ...c.getState(), ...prefixInputs(c.inputs) };
    const pressures: Record<string, number> = {};
    this.network.nodes.forEach((n, i) => (pressures[n.id] = this.network.p[i]!));
    return {
      time: this.time,
      rng: this.rng.getState(),
      fluid: { ...this.fluidState },
      components,
      pressures,
      faults: structuredClone(this.faults.getState()),
      externalLoss: this.externalLoss,
      leakByElement: { ...this.leakByElement },
      definition: structuredClone(this.def),
    };
  }

  restore(s: SimSnapshot) {
    this.time = s.time;
    this.rng.setState(s.rng);
    Object.assign(this.fluidState, s.fluid);
    this.faults.setState(structuredClone(s.faults));
    this.externalLoss = s.externalLoss;
    this.leakByElement = { ...s.leakByElement };
    if (JSON.stringify(s.definition) !== JSON.stringify(this.def)) this.build(structuredClone(s.definition));
    this.applyStates(s);
  }

  private applyStates(s: Pick<SimSnapshot, 'components' | 'pressures'>) {
    for (const [id, c] of this.components) {
      const st = s.components[id];
      if (!st) continue;
      c.setState(st);
      for (const [k, v] of Object.entries(st)) if (k.startsWith('in:')) c.inputs[k.slice(3)] = v;
    }
    this.network.nodes.forEach((n, i) => {
      const v = s.pressures[n.id];
      if (v !== undefined && !n.boundary) this.network.p[i] = v;
    });
  }

  /**
   * Rebuild with a modified circuit (component replaced, hose re-routed,
   * test equipment inserted) while carrying over all compatible state.
   */
  rebuild(def: CircuitDefinition, opts: { resetComponents?: string[] } = {}) {
    const snap = this.snapshot();
    for (const id of opts.resetComponents ?? []) delete snap.components[id];
    this.build(structuredClone(def));
    this.applyStates(snap);
  }

  nodeInfo(): NodeInfo[] {
    return this.network.nodes;
  }
}

function prefixInputs(inputs: Record<string, number>): Record<string, number> {
  const o: Record<string, number> = {};
  for (const [k, v] of Object.entries(inputs)) o[`in:${k}`] = v;
  return o;
}

import { BAR, LPM, clamp } from '../core/units';
import { pumpTorque } from '../physics/formulas';
import { HydraulicSimulation, type SimSnapshot, type SimulationOptions } from '../hydraulics/simulation';
import type { CircuitDefinition, ComponentInstanceDefinition, ConnectionDefinition, SimEvent } from '../hydraulics/types';
import type { FaultSpec } from '../failures/faults';
import { DumpBodyMechanism } from './mechanisms';
import type { ElectricalCircuitConfig, MachineDefinition } from './types';

export type PtoState = 'disengaged' | 'engaging' | 'engaged';

export interface ControlState {
  ignition: boolean;
  engineRunning: boolean;
  throttle: number;
  parkingBrake: boolean;
  ptoSwitch: boolean;
  hoist: -1 | 0 | 1;
  emergencyStop: boolean;
}

export interface SafetyState {
  lotoApplied: boolean;
  wheelsChocked: boolean;
  bodyPropInstalled: boolean;
}

export interface ElectricalReading {
  id: string;
  label: string;
  connector: string;
  energised: boolean;
  /** Voltage at the device connector (V) – back-probed with the circuit live. */
  voltage: number;
  current: number;
  pulledIn: boolean;
  /** Coil resistance measured with the connector unplugged (Ω, Infinity = OL). */
  coilResistance: number;
}

export interface MachineSnapshot {
  hydraulics: SimSnapshot;
  controls: ControlState;
  safety: SafetyState;
  engineRpm: number;
  pto: { state: PtoState; timer: number; outputRpm: number; dropout: number };
  payload: number;
  disconnected: string[];
  removed: Record<string, ComponentInstanceDefinition>;
  stallTimer: number;
  circuit: CircuitDefinition;
  capped: string[];
  removedConnections: Record<string, ConnectionDefinition>;
}

/**
 * A complete machine: engine → PTO → pump drive, electrical controls,
 * mechanisms and the hydraulic circuit. The HydraulicSimulation remains the
 * single source of truth for all hydraulic quantities; this class only
 * supplies boundary conditions (shaft speed, valve commands, loads).
 */
export class MachineSimulation {
  readonly def: MachineDefinition;
  /** Authoritative, current circuit (changes when components are replaced or lines re-routed). */
  circuit: CircuitDefinition;
  sim: HydraulicSimulation;
  controls: ControlState = {
    ignition: false,
    engineRunning: false,
    throttle: 0,
    parkingBrake: true,
    ptoSwitch: false,
    hoist: 0,
    emergencyStop: false,
  };
  safety: SafetyState = { lotoApplied: false, wheelsChocked: false, bodyPropInstalled: false };
  engineRpm = 0;
  pto = { state: 'disengaged' as PtoState, timer: 0, outputRpm: 0, dropout: 0 };
  body: DumpBodyMechanism | null;
  /** Connections currently disconnected for service. */
  disconnected = new Set<string>();
  /** Components removed from the machine (kept for inspection). */
  removed = new Map<string, ComponentInstanceDefinition>();
  /** Faults carried by removed units (used for bench testing and inspection). */
  removedFaults = new Map<string, FaultSpec[]>();
  private stallTimer = 0;
  private inhibitLogged = '';
  private lastPumpTorque = 0;

  constructor(def: MachineDefinition, opts: SimulationOptions & { payload?: number } = {}) {
    this.def = def;
    this.circuit = structuredClone(def.circuit);
    this.sim = new HydraulicSimulation(this.circuit, opts);
    const m = def.mechanisms.find((x) => x.type === 'dump-body');
    this.body = m ? new DumpBodyMechanism(m, opts.payload ?? m.ratedPayload) : null;
    this.sim.onBeforeStep = () => this.applyBoundaryConditions();
  }

  get faults() {
    return this.sim.faults;
  }
  get time() {
    return this.sim.time;
  }
  get events(): SimEvent[] {
    return this.sim.events;
  }

  log(level: SimEvent['level'], source: string, code: string, message: string) {
    this.sim.log({ level, source, code, message });
  }

  // ───────────── operator controls ─────────────
  setIgnition(on: boolean) {
    this.controls.ignition = on;
    if (!on) this.stopEngine();
  }

  startEngine(): boolean {
    if (this.controls.emergencyStop) {
      this.log('warning', 'engine', 'start-blocked', 'Engine start blocked: emergency stop is latched.');
      return false;
    }
    if (this.safety.lotoApplied) {
      this.log('alarm', 'engine', 'start-blocked-loto', 'Engine start blocked: lockout/tagout applied – key removed and locked.');
      return false;
    }
    if (!this.controls.ignition) this.controls.ignition = true;
    if (this.controls.ptoSwitch) this.log('warning', 'engine', 'start-pto-on', 'Engine started with the PTO switch ON – always start with PTO switched off.');
    this.controls.engineRunning = true;
    this.engineRpm = this.def.engine.idleRpm;
    this.log('info', 'engine', 'started', 'Engine started.');
    return true;
  }

  stopEngine() {
    if (this.controls.engineRunning) this.log('info', 'engine', 'stopped', 'Engine stopped.');
    this.controls.engineRunning = false;
  }

  setThrottle(t: number) {
    this.controls.throttle = clamp(t, 0, 1);
  }
  setParkingBrake(on: boolean) {
    this.controls.parkingBrake = on;
  }
  setPtoSwitch(on: boolean) {
    this.controls.ptoSwitch = on;
    this.inhibitLogged = '';
  }
  setHoist(cmd: -1 | 0 | 1) {
    this.controls.hoist = cmd;
  }
  setEmergencyStop(on: boolean) {
    this.controls.emergencyStop = on;
    if (on) {
      this.stopEngine();
      this.controls.hoist = 0;
      this.log('alarm', 'controls', 'estop', 'EMERGENCY STOP activated – engine stopped, controls de-energised.');
    }
  }
  setPayload(kg: number) {
    if (this.body) this.body.payload = Math.max(0, kg);
  }

  // ───────────── electrical ─────────────
  batteryVoltage(): number {
    if (!this.controls.ignition) return 0;
    return this.controls.engineRunning ? 13.9 : 12.5;
  }

  private circuitEnergised(c: ElectricalCircuitConfig): boolean {
    if (!this.controls.ignition || this.controls.emergencyStop) return false;
    if (c.device === 'pto-solenoid') return this.controls.ptoSwitch;
    if (c.device === 'dcv-solenoid-a') return this.controls.hoist > 0;
    if (c.device === 'dcv-solenoid-b') return this.controls.hoist < 0;
    return false;
  }

  electrical(): ElectricalReading[] {
    const f = this.sim.faults;
    const T = this.sim.fluidState.temperature;
    return this.def.electrical.map((c) => {
      const energised = this.circuitEnergised(c);
      const V = energised ? this.batteryVoltage() : 0;
      const coilOpen = f.severity(c.id, 'pto-solenoid-open') > 0.5 || f.severity(c.id, 'dcv-solenoid-open') > 0.5;
      const wireOpen = f.severity(c.id, 'wiring-open') > 0.5;
      const Rw = c.wireResistance + 9 * f.severity(c.id, 'wiring-high-resistance');
      const Rc = c.coilResistance * (1 + 0.0039 * (Math.max(T, this.sim.ambient) - 20));
      let voltage = 0;
      let current = 0;
      if (!wireOpen) {
        if (coilOpen) voltage = V;
        else {
          current = V / (Rc + Rw);
          voltage = current * Rc;
        }
      }
      return {
        id: c.id,
        label: c.label,
        connector: c.connector,
        energised,
        voltage,
        current,
        pulledIn: current > 0 && voltage >= c.pullInVoltage,
        coilResistance: coilOpen ? Infinity : Rc,
      };
    });
  }

  // ───────────── per-step boundary conditions ─────────────
  private applyBoundaryConditions() {
    const dt = this.sim.dt;
    const f = this.sim.faults;
    const eng = this.def.engine;
    const pto = this.def.pto;
    const elec = this.electrical();

    // Engine speed with load droop / stall.
    if (this.controls.engineRunning) {
      let target = eng.idleRpm + this.controls.throttle * (eng.maxRpm - eng.idleRpm);
      const demand = this.pto.state === 'engaged' ? this.lastPumpTorque * pto.ratio : 0;
      if (demand > eng.availableTorque) {
        target *= clamp(eng.availableTorque / demand, 0.3, 1);
        this.stallTimer += dt;
        if (demand > eng.availableTorque * 1.35 && this.stallTimer > 1.5) {
          this.log('alarm', 'engine', 'stall', 'Engine stalled under hydraulic load (PTO torque demand exceeded available engine torque).');
          this.stopEngine();
          this.stallTimer = 0;
        }
      } else this.stallTimer = Math.max(0, this.stallTimer - dt);
      this.engineRpm += ((target - this.engineRpm) * dt) / 0.6;
    } else {
      this.engineRpm = Math.max(0, this.engineRpm - 900 * dt);
    }

    // PTO engagement logic.
    const sol = elec.find((e) => e.id === this.ptoCircuitId());
    const shiftCommanded = !!sol?.pulledIn;
    const shiftFail = f.severity('pto', 'pto-no-engage') > 0.5;
    if (this.pto.state === 'disengaged') {
      if (shiftCommanded) {
        const why = !this.controls.engineRunning
          ? 'engine not running'
          : this.engineRpm > eng.ptoEngageMaxRpm + 20
            ? `engine speed above ${eng.ptoEngageMaxRpm} rpm engagement limit`
            : pto.requiresParkingBrake && !this.controls.parkingBrake
              ? 'parking brake not set'
              : '';
        if (why) {
          if (this.inhibitLogged !== why) {
            this.log('warning', 'pto', 'engage-inhibited', `PTO engagement inhibited: ${why}.`);
            this.inhibitLogged = why;
          }
        } else if (!shiftFail) {
          this.pto.state = 'engaging';
          this.pto.timer = 0;
        }
      }
    } else {
      const lostInterlock = !this.controls.engineRunning || (pto.requiresParkingBrake && !this.controls.parkingBrake);
      if (!shiftCommanded || lostInterlock || shiftFail) {
        if (lostInterlock && this.pto.state === 'engaged') this.log('warning', 'pto', 'disengaged-interlock', 'PTO disengaged: interlock condition lost.');
        this.pto.state = 'disengaged';
      } else if (this.pto.state === 'engaging') {
        this.pto.timer += dt;
        if (this.pto.timer >= pto.shiftTime) {
          this.pto.state = 'engaged';
          this.log('info', 'pto', 'engaged', 'PTO engaged.');
        }
      }
    }

    // PTO output speed: slip under torque, gear-damage dropouts.
    let out = 0;
    if (this.pto.state === 'engaged') {
      out = this.engineRpm * pto.ratio;
      const torqueFrac = this.lastPumpTorque / pto.ratedTorque;
      const slip = f.severity('pto', 'pto-slip') * clamp((torqueFrac - 0.15) / 0.35, 0, 1) * 0.85;
      out *= 1 - slip;
      const gear = f.severity('pto', 'pto-gear-damage');
      if (gear > 0) {
        if (this.pto.dropout > 0) {
          this.pto.dropout -= dt;
          out = 0;
        } else if (torqueFrac > 0.45 && this.sim.rng.next() < gear * 0.6 * dt) {
          this.pto.dropout = 0.4;
          this.log('warning', 'pto', 'clunk', 'Loud clunk from PTO – drive momentarily lost.');
        }
      }
      if (torqueFrac > 1.6) {
        if (!f.has('pto', 'pto-gear-damage')) {
          f.add({ id: 'induced-pto-overload', kind: 'pto-gear-damage', target: 'pto', severity: 0.4, induced: true });
          this.log('alarm', 'pto', 'overload', 'PTO overloaded far beyond rating – gear damage likely.');
        }
      }
    }
    this.pto.outputRpm = out;
    const coupling = f.severity('pto', 'pto-coupling-failure') > 0.5;
    const pump = this.sim.components.get(this.def.pump);
    if (pump) {
      pump.inputs.speed = coupling ? 0 : out;
      pump.inputs.driveRotation = pto.outputRotation === 'cw' ? 1 : -1;
    }

    // Directional valve command from solenoids.
    const valve = this.sim.components.get(this.def.hoistValve);
    if (valve) {
      const a = elec.find((e) => this.def.electrical.find((c) => c.id === e.id)?.device === 'dcv-solenoid-a');
      const b = elec.find((e) => this.def.electrical.find((c) => c.id === e.id)?.device === 'dcv-solenoid-b');
      const cmd = (a?.pulledIn ? 1 : 0) - (b?.pulledIn ? 1 : 0);
      valve.inputs.command = cmd;
    }

    // Mechanism loads.
    if (this.body) {
      const cyl = this.sim.components.get(this.body.cfg.cylinder);
      if (cyl) {
        const x = cyl.getState().x ?? 0;
        this.body.propInstalled = this.safety.bodyPropInstalled;
        this.body.update(x, dt);
        cyl.inputs.externalForce = this.body.requiredForce(this.body.angle);
      }
    }

    // Torque the pump will demand this step (for droop/slip on the next).
    if (pump) {
      const Vd = (Number(pump.def.params.displacement) || 50) * 1e-6;
      const dp = Math.max(0, this.sim.pressureAt(this.def.pump, 'OUT') - this.sim.pressureAt(this.def.pump, 'IN'));
      this.lastPumpTorque = pump.inputs.speed ? pumpTorque(Vd, dp, Number(pump.def.params.mechanicalEfficiency) || 0.88) : 0;
    }
  }

  private ptoCircuitId() {
    return this.def.electrical.find((c) => c.device === 'pto-solenoid')?.id ?? '';
  }

  // ───────────── time ─────────────
  step() {
    this.sim.step();
  }

  advance(seconds: number) {
    const n = Math.max(0, Math.round(seconds / this.sim.dt));
    for (let i = 0; i < n; i++) this.sim.step();
  }

  // ───────────── derived state ─────────────
  pumpTorque() {
    return this.lastPumpTorque;
  }

  cylinderExtension(): number {
    if (!this.body) return 0;
    return this.sim.readout(this.body.cfg.cylinder, 'extension') || 0;
  }

  bodyAngle(): number {
    return this.body?.angleDeg() ?? 0;
  }

  /** Highest pressure anywhere in the hydraulic circuit (Pa). */
  maxSystemPressure(): number {
    return this.sim.maxPressure();
  }

  isDepressurised(): boolean {
    return this.maxSystemPressure() < 1 * BAR;
  }

  /** Stored-energy hazards that must be controlled before opening the circuit. */
  storedEnergyHazards(): string[] {
    const h: string[] = [];
    if (this.controls.engineRunning) h.push('Engine running – PTO/pump can be driven.');
    if (this.pto.state !== 'disengaged') h.push('PTO engaged.');
    if (this.body && this.bodyAngle() > 1 && !this.safety.bodyPropInstalled) h.push('Dump body raised and NOT mechanically supported – gravity load is held only by trapped oil.');
    if (!this.isDepressurised()) h.push(`Trapped hydraulic pressure present (${(this.maxSystemPressure() / BAR).toFixed(0)} bar).`);
    for (const c of this.circuit.components) if (c.type === 'accumulator' && this.sim.readout(c.id, 'pressure') > BAR) h.push(`${c.label} charged.`);
    return h;
  }

  // ───────────── service operations (modify the real circuit) ─────────────
  private rebuild(resetComponents: string[] = []) {
    const def = structuredClone(this.circuit);
    def.connections = def.connections.filter((c) => !this.disconnected.has(c.id));
    for (const id of this.disconnected) {
      const c = this.circuit.connections.find((x) => x.id === id);
      if (!c) continue;
      for (const end of [c.from, c.to]) {
        if (!def.components.some((x) => x.id === end.component)) continue;
        def.components.push({
          id: `open:${id}:${end.component}.${end.port}`,
          type: 'open-port',
          label: 'Open port',
          params: { at: `${end.component}.${end.port}`, bore: c.hose.innerDiameter * 1000, capped: this.capped.has(`${id}:${end.component}.${end.port}`) },
        });
      }
    }
    this.sim.rebuild(def, { resetComponents });
  }

  capped = new Set<string>();

  /**
   * Disconnect a hydraulic line. Opening a line that holds pressure (or a
   * raised, unsupported load) releases that energy – recorded as an alarm.
   */
  disconnect(connectionId: string, capEnds = true): { ok: boolean; message: string } {
    const c = this.circuit.connections.find((x) => x.id === connectionId);
    if (!c) return { ok: false, message: 'Unknown line.' };
    if (this.disconnected.has(connectionId)) return { ok: false, message: 'Line already disconnected.' };
    const p = Math.max(this.sim.pressureAt(c.from.component, c.from.port) || 0, this.sim.pressureAt(c.to.component, c.to.port) || 0);
    if (p > 2 * BAR) {
      this.log('alarm', connectionId, 'opened-under-pressure', `UNSAFE: ${c.label ?? c.id} opened with ${(p / BAR).toFixed(0)} bar trapped – fluid injection / whipping hazard.`);
    }
    this.disconnected.add(connectionId);
    for (const end of [c.from, c.to]) {
      const key = `${connectionId}:${end.component}.${end.port}`;
      if (capEnds) this.capped.add(key);
      else this.capped.delete(key);
    }
    this.rebuild();
    return { ok: true, message: `${c.label ?? c.id} disconnected${capEnds ? ' and capped' : ' (ends left open)'}.` };
  }

  /** Reconnect a line, optionally to different ports (mis-connection is possible and simulated). */
  reconnect(connectionId: string, from?: ConnectionDefinition['from'], to?: ConnectionDefinition['to']): { ok: boolean; message: string } {
    const c = this.circuit.connections.find((x) => x.id === connectionId);
    if (!c) return { ok: false, message: 'Unknown line.' };
    const exists = (r: ConnectionDefinition['from']) => this.circuit.components.some((x) => x.id === r.component);
    const nf = from ?? c.from;
    const nt = to ?? c.to;
    if (!exists(nf) || !exists(nt)) return { ok: false, message: 'Both ends must connect to an installed component.' };
    c.from = nf;
    c.to = nt;
    this.disconnected.delete(connectionId);
    for (const k of [...this.capped]) if (k.startsWith(`${connectionId}:`)) this.capped.delete(k);
    this.rebuild();
    return { ok: true, message: `${c.label ?? c.id} connected ${nf.component}.${nf.port} → ${nt.component}.${nt.port}.` };
  }

  connectionsOf(componentId: string): ConnectionDefinition[] {
    return this.circuit.connections.filter((c) => c.from.component === componentId || c.to.component === componentId);
  }

  removeComponent(id: string): { ok: boolean; message: string } {
    const comp = this.circuit.components.find((c) => c.id === id);
    if (!comp) return { ok: false, message: 'Component not installed.' };
    const attached = this.connectionsOf(id).filter((c) => !this.disconnected.has(c.id));
    if (attached.length) return { ok: false, message: `Disconnect ${attached.map((c) => c.label ?? c.id).join(', ')} first.` };
    this.removed.set(id, comp);
    this.removedFaults.set(
      id,
      this.sim.faults.outstanding().filter((f) => f.spec.target === id).map((f) => ({ ...f.spec, severity: f.severity, activation: undefined })),
    );
    this.circuit.components = this.circuit.components.filter((c) => c.id !== id);
    this.rebuild();
    return { ok: true, message: `${comp.label} removed.` };
  }

  /** Install a component (new part) in the slot `id`. Faults on the removed unit go with it. */
  installComponent(def: ComponentInstanceDefinition): { ok: boolean; message: string } {
    if (this.circuit.components.some((c) => c.id === def.id)) return { ok: false, message: 'Slot already occupied.' };
    this.circuit.components.push(structuredClone(def));
    this.sim.faults.repair(def.id);
    this.removed.delete(def.id);
    this.rebuild([def.id]);
    return { ok: true, message: `${def.label} installed.` };
  }

  /** Replace a hose assembly (removes hose faults on that line). Line must be disconnected. */
  replaceHose(connectionId: string, hose?: ConnectionDefinition['hose']): { ok: boolean; message: string } {
    const c = this.circuit.connections.find((x) => x.id === connectionId);
    if (!c) return { ok: false, message: 'Unknown line.' };
    if (!this.disconnected.has(connectionId)) return { ok: false, message: 'Disconnect the hose before replacing it.' };
    if (hose) c.hose = hose;
    this.sim.faults.repair(connectionId, ['hose-pinhole', 'hose-rupture', 'hose-restricted', 'suction-collapsed', 'fitting-loose', 'suction-air-leak']);
    return { ok: true, message: `${c.label ?? c.id} hose assembly replaced.` };
  }

  tightenFitting(connectionId: string): { ok: boolean; message: string } {
    const ids = this.sim.faults.repair(connectionId, ['fitting-loose', 'suction-air-leak']);
    return { ok: true, message: ids.length ? 'Fitting re-torqued; seal now tight.' : 'Fitting already at specified torque – no change.' };
  }

  replaceFilterElement(id: string) {
    const c = this.sim.components.get(id);
    c?.setState({ clog: 0.02 });
    this.sim.faults.repair(id, ['filter-clogged']);
  }

  topUpFluid(reservoirId: string, litres: number) {
    const r = this.sim.components.get(reservoirId);
    if (!r) return;
    const v = r.getState().volume ?? 0;
    r.setState({ volume: v + litres * 1e-3 });
    this.sim.faults.repair(reservoirId, ['low-fluid']);
  }

  drainAndRefill(grade: string) {
    const fs = this.sim.fluidState;
    fs.grade = grade;
    fs.contamination = 15;
    fs.water = 100;
    fs.airFraction = 0.02;
    this.sim.faults.repair('fluid', ['fluid-contaminated', 'fluid-incorrect', 'fluid-water']);
  }

  bleedAir() {
    this.sim.fluidState.airFraction = 0;
    this.sim.faults.repair('fluid', ['air-entrained']);
  }

  /** Adjust a pressure setting by `delta` Pa (screw turns). Misadjustment faults are baked in on first adjust. */
  adjustSetting(componentId: string, delta: number): number {
    const c = this.sim.components.get(componentId);
    if (!c) return NaN;
    const f = this.sim.faults;
    const mis = f.severity(componentId, 'relief-misadjusted');
    let s = c.inputs.setting ?? 0;
    if (mis > 0 || f.has(componentId, 'relief-misadjusted')) {
      s = s * (1 - 0.55 * f.faults.filter((x) => x.spec.target === componentId && x.spec.kind === 'relief-misadjusted' && !x.repaired).reduce((m, x) => Math.max(m, x.severity), 0));
      f.repair(componentId, ['relief-misadjusted']);
    }
    s = Math.max(0, s + delta);
    c.inputs.setting = s;
    const def = this.circuit.components.find((x) => x.id === componentId);
    if (def) def.params.crackingPressure = s / BAR;
    this.log('info', componentId, 'adjusted', `${c.label} adjusted to ${(s / BAR).toFixed(0)} bar (simulated setting).`);
    return s;
  }

  effectiveSetting(componentId: string): number {
    const c = this.sim.components.get(componentId);
    if (!c) return NaN;
    const mis = this.sim.faults.faults.filter((x) => x.spec.target === componentId && x.spec.kind === 'relief-misadjusted' && !x.repaired).reduce((m, x) => Math.max(m, x.severity), 0);
    return (c.inputs.setting ?? 0) * (1 - 0.55 * mis);
  }

  freeSpool(componentId: string) {
    this.sim.faults.repair(componentId, ['spool-stuck']);
  }
  repairWiring(circuitId: string) {
    this.sim.faults.repair(circuitId, ['wiring-open', 'wiring-high-resistance']);
  }
  replaceSolenoid(circuitId: string) {
    this.sim.faults.repair(circuitId, ['pto-solenoid-open', 'dcv-solenoid-open']);
  }
  repairPto() {
    this.sim.faults.repair('pto');
  }
  cleanCooler(id: string) {
    this.sim.faults.repair(id, ['cooler-blocked']);
  }

  /** Insert an in-line flow tester into a pressure line (line must be disconnected). */
  installFlowTester(connectionId = this.def.flowTestConnection, reversed = false): { ok: boolean; message: string } {
    const c = this.circuit.connections.find((x) => x.id === connectionId);
    if (!c) return { ok: false, message: 'Unknown line.' };
    if (!this.disconnected.has(connectionId)) return { ok: false, message: 'The line must be disconnected (depressurised) before installing the tester.' };
    if (this.circuit.components.some((x) => x.id === 'flow-tester')) return { ok: false, message: 'Tester already installed.' };
    this.circuit.components.push({ id: 'flow-tester', type: 'flow-meter', label: 'In-line flow tester', params: { load: 0 } });
    const inPort = reversed ? 'OUT' : 'IN';
    const outPort = reversed ? 'IN' : 'OUT';
    this.circuit.connections.push(
      { id: 'ft-in', from: c.from, to: { component: 'flow-tester', port: inPort }, lineType: 'pressure', hose: { ...c.hose, length: 1.5 }, label: 'Tester inlet hose' },
      { id: 'ft-out', from: { component: 'flow-tester', port: outPort }, to: c.to, lineType: 'pressure', hose: { ...c.hose, length: 1.5 }, label: 'Tester outlet hose' },
    );
    this.disconnected.delete(connectionId);
    this.circuit.connections = this.circuit.connections.filter((x) => x.id !== connectionId);
    this.removedConnections.set(connectionId, c);
    this.rebuild();
    return { ok: true, message: 'Flow tester installed in the pump pressure line.' };
  }

  removedConnections = new Map<string, ConnectionDefinition>();

  removeFlowTester(): { ok: boolean; message: string } {
    const orig = this.removedConnections.get(this.def.flowTestConnection);
    if (!orig) return { ok: false, message: 'No tester installed.' };
    if (!this.isDepressurised() || this.controls.engineRunning) this.log('alarm', 'flow-tester', 'opened-under-pressure', 'UNSAFE: flow tester removed without shutting down and depressurising.');
    this.circuit.components = this.circuit.components.filter((x) => x.id !== 'flow-tester');
    this.circuit.connections = this.circuit.connections.filter((x) => x.id !== 'ft-in' && x.id !== 'ft-out');
    this.circuit.connections.push(orig);
    this.removedConnections.delete(this.def.flowTestConnection);
    this.rebuild();
    return { ok: true, message: 'Flow tester removed; pressure line reconnected.' };
  }

  // ───────────── snapshots ─────────────
  snapshot(): MachineSnapshot {
    return {
      hydraulics: this.sim.snapshot(),
      controls: { ...this.controls },
      safety: { ...this.safety },
      engineRpm: this.engineRpm,
      pto: { ...this.pto },
      payload: this.body?.payload ?? 0,
      disconnected: [...this.disconnected],
      removed: Object.fromEntries(this.removed),
      stallTimer: this.stallTimer,
      circuit: structuredClone(this.circuit),
      capped: [...this.capped],
      removedConnections: structuredClone(Object.fromEntries(this.removedConnections)),
    };
  }

  restore(s: MachineSnapshot) {
    this.controls = { ...s.controls };
    this.safety = { ...s.safety };
    this.engineRpm = s.engineRpm;
    this.pto = { ...s.pto };
    if (this.body) this.body.payload = s.payload;
    this.disconnected = new Set(s.disconnected);
    this.removed = new Map(Object.entries(s.removed));
    this.stallTimer = s.stallTimer;
    this.circuit = structuredClone(s.circuit);
    this.capped = new Set(s.capped);
    this.removedConnections = new Map(Object.entries(structuredClone(s.removedConnections)));
    this.sim.restore(s.hydraulics);
  }

  setFaults(specs: FaultSpec[]) {
    specs.forEach((s) => this.sim.faults.add(s));
  }

  /** Measured pump delivery (m^3/s) – what an ideal in-line meter would read. */
  pumpFlow(): number {
    return this.sim.readout(this.def.pump, 'flow');
  }

  static LPM = LPM;
}

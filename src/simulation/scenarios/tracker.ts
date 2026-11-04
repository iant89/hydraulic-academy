import { BAR, LPM } from '../core/units';
import type { MachineSimulation } from '../machine/machine';
import type { VerificationCriterion } from './types';

export interface TrackerResults {
  ptoDrive: boolean;
  lastRaiseSeconds: number | null;
  lastLoadedRaiseSeconds: number | null;
  endOfStrokePressure: number | null;
  cavitationWhileRaising: boolean;
  leakFreeOperatingSeconds: number;
  maxLeakRate: number;
  worstHoldDrift: number | null;
  holdWindowSeconds: number;
  loweredFully: boolean;
  operatingSeconds: number;
  /** function id → directions observed moving */
  functionsMoved: Record<string, number[]>;
  /** component id → worst drift rate (mm/min for cylinders, deg/min for motors) over ≥30 s holds */
  holdDrift: Record<string, { rate: number; seconds: number }>;
  /** Heaviest load (kg) lifted clear of the ground with the stabilizer set. */
  maxLiftedKg: number;
}

/**
 * Watches machine operation (every simulation step) and records the
 * performance evidence used to verify a repair. Results reset when a
 * repair is declared complete so that only post-repair operation counts.
 */
export class OperationTracker {
  results: TrackerResults = OperationTracker.empty();
  private raiseStart: number | null = null;
  private raiseLoaded = false;
  private endStrokeTimer = 0;
  private holdStart: { t: number; x: number } | null = null;
  private wasRaised = false;
  private neutralTime = 0;
  private reliefTimer = 0;
  private holdStarts: Record<string, { t: number; x: number }> = {};
  private listener = () => this.update();

  constructor(private m: MachineSimulation) {}

  static empty(): TrackerResults {
    return {
      ptoDrive: false,
      lastRaiseSeconds: null,
      lastLoadedRaiseSeconds: null,
      endOfStrokePressure: null,
      cavitationWhileRaising: false,
      leakFreeOperatingSeconds: 0,
      maxLeakRate: 0,
      worstHoldDrift: null,
      holdWindowSeconds: 0,
      loweredFully: false,
      operatingSeconds: 0,
      functionsMoved: {},
      holdDrift: {},
      maxLiftedKg: 0,
    };
  }

  attach() {
    this.m.sim.afterStep.push(this.listener);
    return this;
  }

  detach() {
    this.m.sim.afterStep = this.m.sim.afterStep.filter((l) => l !== this.listener);
  }

  reset() {
    this.results = OperationTracker.empty();
    this.raiseStart = null;
    this.holdStart = null;
    this.wasRaised = false;
    this.endStrokeTimer = 0;
    this.holdStarts = {};
    this.reliefTimer = 0;
  }

  private update() {
    const m = this.m;
    const dt = m.sim.dt;
    const r = this.results;
    const pumpSpeed = Math.abs(m.sim.getInput(m.def.pump, 'speed'));
    if (m.pto.state === 'engaged' && pumpSpeed > 100 && m.pumpFlow() > 5 * LPM) r.ptoDrive = true;
    if (pumpSpeed > 100) r.operatingSeconds += dt;

    // Function movement in each direction.
    for (const f of m.def.functions) {
      const cmd = m.command(f.id);
      if (!cmd) continue;
      const v = m.sim.readout(f.actuator, f.movementKey);
      const thr = f.movementKey === 'velocity' ? 0.005 : 5;
      if (Number.isFinite(v) && Math.sign(v) === Math.sign(cmd) && Math.abs(v) > thr) {
        const dirs = r.functionsMoved[f.id] ?? [];
        if (!dirs.includes(Math.sign(cmd))) r.functionsMoved[f.id] = [...dirs, Math.sign(cmd)];
      }
    }

    // Relief pressure: pump outlet while the main relief is passing flow steadily.
    if (m.sim.components.has(m.def.mainRelief) && m.sim.readout(m.def.mainRelief, 'open') === 1 && m.anyCommanded()) {
      this.reliefTimer += dt;
      if (this.reliefTimer > 1) r.endOfStrokePressure = Math.max(r.endOfStrokePressure ?? 0, m.sim.pressureAt(m.def.pump, 'OUT'));
    } else this.reliefTimer = 0;

    // Leakage under pressure
    const pmax = m.maxSystemPressure();
    const leak = Object.values(m.sim.leakRate).reduce((a, b) => a + b, 0);
    if (pmax > 30 * BAR) {
      r.maxLeakRate = Math.max(r.maxLeakRate, leak);
      if (leak < 0.01 * LPM) r.leakFreeOperatingSeconds += dt;
    }

    // Generic hold drift for every actuator while all controls are neutral.
    this.neutralTime = !m.anyCommanded() ? this.neutralTime + dt : 0;
    const crane = m.craneState();
    for (const c of m.circuit.components) {
      if (c.type !== 'cylinder' && c.type !== 'motor') continue;
      if (!m.sim.components.has(c.id)) continue;
      const isCyl = c.type === 'cylinder';
      const ext = isCyl ? m.sim.readout(c.id, 'extension') : 0.5;
      const pos = isCyl ? m.sim.readout(c.id, 'position') * 1000 : m.sim.components.get(c.id)!.getState().angle ?? 0;
      const ok = this.neutralTime > 2 && ext > 0.03 && ext < 0.97 && !m.safety.bodyPropInstalled;
      if (!ok) {
        delete this.holdStarts[c.id];
        continue;
      }
      if (!this.holdStarts[c.id]) this.holdStarts[c.id] = { t: m.time, x: pos };
      const h = this.holdStarts[c.id]!;
      const span = m.time - h.t;
      if (span >= 30) {
        const rate = (Math.abs(pos - h.x) * 60) / span;
        const prev = r.holdDrift[c.id];
        // Crane loads only count when a load is actually suspended.
        if (!crane || crane.loadSuspended || isCyl) r.holdDrift[c.id] = { rate: Math.max(prev?.rate ?? 0, rate), seconds: Math.max(prev?.seconds ?? 0, span) };
      }
    }

    if (crane && crane.loadSuspended && crane.outriggerSet && crane.hookHeight > 0.3) r.maxLiftedKg = Math.max(r.maxLiftedKg, m.crane!.hookLoad);

    const body = m.body;
    if (!body) return;
    const cyl = body.cfg.cylinder;
    const ext = m.sim.readout(cyl, 'extension');
    const hoist = m.hoist;

    // Raise timing
    if (hoist > 0 && ext < 0.03 && this.raiseStart === null && pumpSpeed > 100) {
      this.raiseStart = m.time;
      this.raiseLoaded = body.payload >= body.cfg.ratedPayload * 0.9;
    }
    if (hoist <= 0 && ext < 0.03) this.raiseStart = null;
    if (this.raiseStart !== null && ext > 0.95) {
      const t = m.time - this.raiseStart;
      r.lastRaiseSeconds = t;
      if (this.raiseLoaded) r.lastLoadedRaiseSeconds = t;
      this.raiseStart = null;
    }
    if (hoist > 0 && pumpSpeed > 100 && m.sim.readout(m.def.pump, 'cavitating') === 1) r.cavitationWhileRaising = true;

    // End-of-stroke (relief) pressure at TP1
    if (hoist > 0 && ext > 0.995) {
      this.endStrokeTimer += dt;
      if (this.endStrokeTimer > 1) {
        const p = m.sim.pressureAt(m.def.pump, 'OUT');
        r.endOfStrokePressure = Math.max(r.endOfStrokePressure ?? 0, p);
      }
    } else this.endStrokeTimer = 0;

    // Hold drift (body)
    if (hoist === 0 && this.neutralTime > 2 && ext > 0.15 && ext < 0.97 && !m.safety.bodyPropInstalled) {
      if (!this.holdStart) this.holdStart = { t: m.time, x: m.sim.readout(cyl, 'position') };
      const dtH = m.time - this.holdStart.t;
      if (dtH >= 30) {
        const rate = ((this.holdStart.x - m.sim.readout(cyl, 'position')) * 1000 * 60) / dtH;
        r.worstHoldDrift = Math.max(r.worstHoldDrift ?? 0, rate);
        r.holdWindowSeconds = Math.max(r.holdWindowSeconds, dtH);
      }
    } else this.holdStart = null;

    if (ext > 0.5) this.wasRaised = true;
    if (this.wasRaised && ext < 0.02) r.loweredFully = true;
  }
}

export interface CriterionResult {
  criterion: VerificationCriterion;
  met: boolean;
  detail: string;
}

export function evaluateCriteria(criteria: VerificationCriterion[], r: TrackerResults, functions: { id: string; label: string }[] = []): CriterionResult[] {
  return criteria.map((c) => {
    switch (c.type) {
      case 'pto-drive':
        return { criterion: c, met: r.ptoDrive, detail: r.ptoDrive ? 'PTO engaged and pump delivering flow.' : 'Not yet observed: engage the PTO with the engine running.' };
      case 'raise-loaded': {
        const t = r.lastLoadedRaiseSeconds;
        return { criterion: c, met: t !== null && t <= c.maxSeconds, detail: t === null ? 'Raise a rated load from fully lowered to full height.' : `Loaded raise took ${t.toFixed(1)} s (limit ${c.maxSeconds} s).` };
      }
      case 'relief-pressure': {
        const p = r.endOfStrokePressure;
        return { criterion: c, met: p !== null && p >= c.min && p <= c.max, detail: p === null ? 'Hold RAISE briefly at full extension to read relief pressure at TP1.' : `End-of-stroke pressure ${(p / BAR).toFixed(0)} bar (accept ${(c.min / BAR).toFixed(0)}–${(c.max / BAR).toFixed(0)} bar).` };
      }
      case 'no-leaks':
        return { criterion: c, met: r.leakFreeOperatingSeconds >= c.seconds && r.maxLeakRate < 0.01 * LPM, detail: `${r.leakFreeOperatingSeconds.toFixed(0)} s leak-free under pressure (need ${c.seconds} s)${r.maxLeakRate >= 0.01 * LPM ? `; leakage of ${(r.maxLeakRate / LPM).toFixed(2)} L/min observed` : ''}.` };
      case 'hold-drift': {
        const d = r.worstHoldDrift;
        return { criterion: c, met: d !== null && d <= c.maxMmPerMin, detail: d === null ? 'Hold the raised body in HOLD for at least 30 s.' : `Drift ${d.toFixed(1)} mm/min over ${r.holdWindowSeconds.toFixed(0)} s (limit ${c.maxMmPerMin}).` };
      }
      case 'lowers':
        return { criterion: c, met: r.loweredFully, detail: r.loweredFully ? 'Body lowered fully.' : 'Lower the body fully after raising.' };
      case 'all-functions': {
        const missing = functions.filter((f) => (r.functionsMoved[f.id] ?? []).length < 2).map((f) => f.label);
        return { criterion: c, met: functions.length > 0 && missing.length === 0, detail: missing.length ? `Not yet operated in both directions: ${missing.join(', ')}.` : 'All functions operate in both directions.' };
      }
      case 'actuator-holds': {
        const d = r.holdDrift[c.component];
        return { criterion: c, met: d !== undefined && d.rate <= c.maxRatePerMin, detail: d === undefined ? `Hold the function in neutral for ≥30 s${c.requireSuspendedLoad ? ' with a load suspended' : ''}.` : `Drift ${d.rate.toFixed(1)} per min over ${d.seconds.toFixed(0)} s (limit ${c.maxRatePerMin}).` };
      }
      case 'lift-load':
        return { criterion: c, met: r.maxLiftedKg >= c.minKg, detail: r.maxLiftedKg ? `Heaviest load lifted with stabilizer set: ${r.maxLiftedKg.toFixed(0)} kg (need ${c.minKg} kg).` : `Attach a ${c.minKg} kg load, set the stabilizer and lift it clear of the ground.` };
      case 'no-cavitation':
        return { criterion: c, met: r.lastRaiseSeconds !== null && !r.cavitationWhileRaising, detail: r.cavitationWhileRaising ? 'Cavitation detected during a raise.' : r.lastRaiseSeconds === null ? 'Complete a raise cycle.' : 'No cavitation during the raise.' };
    }
  });
}

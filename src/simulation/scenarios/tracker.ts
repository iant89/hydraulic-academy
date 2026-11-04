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
  }

  private update() {
    const m = this.m;
    const dt = m.sim.dt;
    const r = this.results;
    const body = m.body;
    const pumpSpeed = Math.abs(m.sim.getInput(m.def.pump, 'speed'));
    if (m.pto.state === 'engaged' && pumpSpeed > 100 && m.pumpFlow() > 5 * LPM) r.ptoDrive = true;
    if (pumpSpeed > 100) r.operatingSeconds += dt;
    if (!body) return;
    const cyl = body.cfg.cylinder;
    const ext = m.sim.readout(cyl, 'extension');
    const hoist = m.controls.hoist;

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

    // Leakage under pressure
    const pmax = m.maxSystemPressure();
    const leak = Object.values(m.sim.leakRate).reduce((a, b) => a + b, 0);
    if (pmax > 30 * BAR) {
      r.maxLeakRate = Math.max(r.maxLeakRate, leak);
      if (leak < 0.01 * LPM) r.leakFreeOperatingSeconds += dt;
    }

    // Hold drift (window starts once the spool has centred and motion settled)
    this.neutralTime = hoist === 0 ? this.neutralTime + dt : 0;
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

export function evaluateCriteria(criteria: VerificationCriterion[], r: TrackerResults): CriterionResult[] {
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
      case 'no-cavitation':
        return { criterion: c, met: r.lastRaiseSeconds !== null && !r.cavitationWhileRaising, detail: r.cavitationWhileRaising ? 'Cavitation detected during a raise.' : r.lastRaiseSeconds === null ? 'Complete a raise cycle.' : 'No cavitation during the raise.' };
    }
  });
}

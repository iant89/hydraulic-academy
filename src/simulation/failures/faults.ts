import { clamp } from '../core/units';
import type { Rng } from '../core/rng';
import type { FaultQuery } from '../hydraulics/types';

export type FaultActivation =
  | { type: 'always' }
  /** Active above a fluid temperature (°C); severity ramps over `ramp` °C. */
  | { type: 'temperature'; above: number; ramp?: number }
  /** Active only while the monitored system pressure exceeds a threshold (Pa). */
  | { type: 'load'; pressureAbove: number }
  /** Randomly toggles; mean on/off durations in seconds (deterministic from seed). */
  | { type: 'intermittent'; meanOn: number; meanOff: number }
  /** Appears only after cumulative operating time (s). */
  | { type: 'after-operating'; seconds: number };

export interface FaultSpec {
  id: string;
  kind: string;
  target: string;
  severity: number;
  activation?: FaultActivation;
  /** Severity increase per hour of operation (progressive degradation). */
  progressionPerHour?: number;
  /** Created by the simulation as secondary damage. */
  induced?: boolean;
}

export interface FaultRuntime {
  spec: FaultSpec;
  severity: number;
  active: boolean;
  timer: number;
  repaired: boolean;
}

export interface FaultConditions {
  temperature: number;
  systemPressure: number;
  operating: boolean;
  dt: number;
}

/** Holds hidden faults and evaluates their activation every step. */
export class FaultManager implements FaultQuery {
  faults: FaultRuntime[] = [];
  operatingTime = 0;

  constructor(specs: FaultSpec[] = []) {
    specs.forEach((s) => this.add(s));
  }

  add(spec: FaultSpec) {
    this.faults.push({ spec, severity: clamp(spec.severity, 0, 1), active: !spec.activation || spec.activation.type === 'always', timer: 0, repaired: false });
  }

  has(target: string, kind: string) {
    return this.faults.some((f) => !f.repaired && f.spec.target === target && f.spec.kind === kind);
  }

  update(c: FaultConditions, rng: Rng) {
    this.lastTemp = c.temperature;
    if (c.operating) this.operatingTime += c.dt;
    for (const f of this.faults) {
      if (f.repaired) continue;
      const a = f.spec.activation ?? { type: 'always' };
      if (f.spec.progressionPerHour && c.operating) f.severity = clamp(f.severity + (f.spec.progressionPerHour * c.dt) / 3600, 0, 1);
      switch (a.type) {
        case 'always':
          f.active = true;
          break;
        case 'temperature':
          f.active = c.temperature >= a.above;
          break;
        case 'load':
          f.active = c.systemPressure >= a.pressureAbove;
          break;
        case 'after-operating':
          f.active = this.operatingTime >= a.seconds;
          break;
        case 'intermittent': {
          f.timer -= c.dt;
          if (f.timer <= 0) {
            f.active = !f.active;
            const mean = f.active ? a.meanOn : a.meanOff;
            f.timer = mean * (0.4 + 1.2 * rng.next());
          }
          break;
        }
      }
    }
  }

  severity(target: string, kind: string): number {
    let s = 0;
    for (const f of this.faults) {
      if (f.repaired || !f.active || f.spec.target !== target || f.spec.kind !== kind) continue;
      let v = f.severity;
      const a = f.spec.activation;
      if (a?.type === 'temperature' && a.ramp) v *= clamp((this.lastTemp - a.above) / a.ramp, 0.15, 1);
      s = Math.max(s, v);
    }
    return s;
  }

  lastTemp = 20;

  /** Mark faults resolved. Returns the repaired fault ids. */
  repair(target: string, kinds?: string[]): string[] {
    const ids: string[] = [];
    for (const f of this.faults) {
      if (f.repaired || f.spec.target !== target) continue;
      if (kinds && !kinds.includes(f.spec.kind)) continue;
      f.repaired = true;
      ids.push(f.spec.id);
    }
    return ids;
  }

  outstanding(): FaultRuntime[] {
    return this.faults.filter((f) => !f.repaired);
  }

  getState() {
    return {
      operatingTime: this.operatingTime,
      faults: this.faults.map((f) => ({ spec: f.spec, severity: f.severity, active: f.active, timer: f.timer, repaired: f.repaired })),
    };
  }

  setState(s: ReturnType<FaultManager['getState']>) {
    this.operatingTime = s.operatingTime;
    this.faults = s.faults.map((f) => ({ ...f }));
  }
}

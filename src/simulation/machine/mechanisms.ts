import { G, clamp } from '../core/units';
import type { CraneMechanismConfig, DumpBodyMechanismConfig } from './types';

const DEG = Math.PI / 180;

/**
 * Dump body kinematics. Hinge at the origin; body rotates by θ about the
 * rear hinge. Cylinder length L(θ) = |R(θ)·attach − base|. Gravity moment
 * about the hinge is W·x_cg(θ); the cylinder force required is that moment
 * divided by the cylinder's perpendicular moment arm about the hinge.
 */
export class DumpBodyMechanism {
  readonly cfg: DumpBodyMechanismConfig;
  payload: number;
  propInstalled = false;
  /** Cylinder closed length implied by geometry at θ = 0. */
  readonly closedLength: number;
  angle = 0;

  constructor(cfg: DumpBodyMechanismConfig, payload = cfg.ratedPayload) {
    this.cfg = cfg;
    this.payload = payload;
    this.closedLength = this.cylinderLength(0);
  }

  private attachWorld(theta: number): [number, number] {
    const [ax, ay] = this.cfg.attach;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    return [ax * c - ay * s, ax * s + ay * c];
  }

  cylinderLength(theta: number): number {
    const [wx, wy] = this.attachWorld(theta);
    const [bx, by] = this.cfg.base;
    return Math.hypot(wx - bx, wy - by);
  }

  /** Body angle (rad) for a cylinder extension (m) – bisection on the monotonic L(θ). */
  angleForExtension(x: number): number {
    const target = this.closedLength + x;
    let lo = 0;
    let hi = this.cfg.maxAngle * DEG * 1.2;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (this.cylinderLength(mid) < target) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  momentArm(theta: number): number {
    const [wx, wy] = this.attachWorld(theta);
    const [bx, by] = this.cfg.base;
    const len = Math.hypot(wx - bx, wy - by);
    const ux = (wx - bx) / len;
    const uy = (wy - by) / len;
    return Math.abs(bx * uy - by * ux);
  }

  /** Cylinder force (N) required to hold the body at θ (positive opposes extension). */
  requiredForce(theta: number): number {
    if (this.propInstalled) return 0;
    const W = (this.cfg.bodyMass + this.payload) * G;
    // CG shifts rearward as the load fraction falls (residual load sits at the tail).
    const loadFrac = this.payload / Math.max(1, this.cfg.ratedPayload);
    const cgx = this.cfg.cg[0] * (0.75 + 0.25 * clamp(loadFrac, 0, 1));
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const xw = cgx * c - this.cfg.cg[1] * s;
    const pivotFriction = 1500;
    return Math.max(0, (W * xw) / this.momentArm(theta)) + pivotFriction;
  }

  /** Advance discharge of material once the body passes the discharge angle. */
  update(cylinderExtension: number, dt: number) {
    this.angle = this.angleForExtension(cylinderExtension);
    const deg = this.angle / DEG;
    if (deg > this.cfg.dischargeAngle && this.payload > 0) {
      const rate = (this.cfg.ratedPayload / 6) * clamp((deg - this.cfg.dischargeAngle) / 10, 0, 1);
      this.payload = Math.max(0, this.payload - rate * dt);
    }
  }

  angleDeg() {
    return this.angle / DEG;
  }
}


/** Per-step view of the crane used for loads, interlocks and display. */
export interface CraneState {
  boomAngle: number;
  boomLength: number;
  radius: number;
  tipHeight: number;
  hookHeight: number;
  cableOut: number;
  slewAngle: number;
  tension: number;
  loadSuspended: boolean;
  moment: number;
  capacity: number;
  momentFraction: number;
  a2b: boolean;
  lmiCutout: boolean;
  outriggerForce: number;
  outriggerSet: boolean;
}

export interface CraneActuatorInputs {
  liftX: number;
  extendX: number;
  winchAngleDeg: number;
  slewAngleDeg: number;
  outriggerX: number;
}

/**
 * Service-truck telescopic crane.
 *
 * Approximations (documented): rigid boom; boom CG at half length; the
 * extension section's weight acts along the boom axis on the extension
 * cylinder; cable force acts vertically at the sheave; dynamic swing of the
 * load is neglected; the truck is level; the stabilizer leg is a linear
 * spring once it contacts the ground, saturating at its share of truck weight.
 */
export class CraneMechanism {
  readonly cfg: CraneMechanismConfig;
  hookLoad: number;
  cableOut: number;
  private lastWinch: number | null = null;
  readonly closedLength: number;
  readonly stroke: number;
  state: CraneState;

  constructor(cfg: CraneMechanismConfig, hookLoad = 0) {
    this.cfg = cfg;
    this.hookLoad = hookLoad;
    this.closedLength = this.liftLength((cfg.minAngle * Math.PI) / 180);
    this.stroke = this.liftLength((cfg.maxAngle * Math.PI) / 180) - this.closedLength;
    // Hook starts on the ground when a load is rigged, otherwise stowed just below the sheave.
    const stowedTip = cfg.pivotHeight + cfg.boomLength * Math.sin((cfg.minAngle * Math.PI) / 180);
    this.cableOut = hookLoad > 0 ? stowedTip : 1.0;
    this.state = this.compute({ liftX: 0, extendX: 0, winchAngleDeg: 0, slewAngleDeg: 0, outriggerX: 0 });
  }

  private attachWorld(theta: number): [number, number] {
    const [ax, ay] = this.cfg.liftAttach;
    return [ax * Math.cos(theta) - ay * Math.sin(theta), ax * Math.sin(theta) + ay * Math.cos(theta)];
  }

  liftLength(theta: number): number {
    const [wx, wy] = this.attachWorld(theta);
    return Math.hypot(wx - this.cfg.liftBase[0], wy - this.cfg.liftBase[1]);
  }

  angleForLift(x: number): number {
    const target = this.closedLength + x;
    let lo = ((this.cfg.minAngle - 5) * Math.PI) / 180;
    let hi = ((this.cfg.maxAngle + 5) * Math.PI) / 180;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (this.liftLength(mid) < target) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  liftArm(theta: number): number {
    const [wx, wy] = this.attachWorld(theta);
    const [bx, by] = this.cfg.liftBase;
    const len = Math.hypot(wx - bx, wy - by);
    return Math.abs((bx * (wy - by)) / len - (by * (wx - bx)) / len);
  }

  /** Advance cable from winch rotation and compute the crane state. */
  compute(a: CraneActuatorInputs): CraneState {
    const c = this.cfg;
    if (this.lastWinch !== null) {
      const dDrum = ((a.winchAngleDeg - this.lastWinch) / c.winchGearRatio) * (Math.PI / 180);
      this.cableOut = Math.max(0, Math.min(c.maxCable, this.cableOut - dDrum * c.drumRadius));
    }
    this.lastWinch = a.winchAngleDeg;
    const theta = this.angleForLift(a.liftX);
    const L = c.boomLength + a.extendX;
    const tipHeight = c.pivotHeight + L * Math.sin(theta);
    const hookHeight = tipHeight - this.cableOut;
    const loadSuspended = this.hookLoad > 0 && hookHeight > 0.02;
    const tension = loadSuspended ? this.hookLoad * G : 0;
    const radius = Math.max(0, L * Math.cos(theta));
    const outriggerForce = a.outriggerX > c.outriggerContact ? Math.min(c.outriggerShare, c.outriggerStiffness * (a.outriggerX - c.outriggerContact)) : 0;
    const outriggerSet = outriggerForce > 0.8 * c.outriggerShare;
    const capacity = outriggerSet ? c.ratedMoment : 0.5 * c.ratedMoment;
    const moment = tension * radius;
    this.state = {
      boomAngle: (theta * 180) / Math.PI,
      boomLength: L,
      radius,
      tipHeight,
      hookHeight,
      cableOut: this.cableOut,
      slewAngle: a.slewAngleDeg / c.slewGearRatio,
      tension,
      loadSuspended,
      moment,
      capacity,
      momentFraction: moment / capacity,
      a2b: this.cableOut < c.a2bDistance,
      lmiCutout: moment > capacity || tension > c.maxLoad * G,
      outriggerForce,
      outriggerSet,
    };
    return this.state;
  }

  /** Lift cylinder force (opposes extension). Boom resting in its cradle carries no cylinder load. */
  liftForce(liftX: number): number {
    if (liftX < 0.002) return 300;
    const c = this.cfg;
    const s = this.state;
    const th = (s.boomAngle * Math.PI) / 180;
    const M = c.boomMass * G * (s.boomLength / 2) * Math.cos(th) + s.tension * s.boomLength * Math.cos(th);
    return Math.max(0, M / this.liftArm(th)) + 600;
  }

  /** Extension cylinder axial load (opposes extension). */
  extendForce(): number {
    const th = (this.state.boomAngle * Math.PI) / 180;
    // Wear-pad friction is represented by the extension cylinder's seal friction.
    const axial = (this.cfg.extensionMass * G + this.state.tension) * Math.sin(th);
    return Math.max(-5000, axial) + 400;
  }

  /** Winch motor load torque (positive opposes hoisting). */
  winchTorque(): number {
    return (this.state.tension * this.cfg.drumRadius) / this.cfg.winchGearRatio / 0.9;
  }

  /** Stabilizer cylinder load: leg weight before contact, ground reaction after. */
  outriggerForce(): number {
    return 400 + this.state.outriggerForce;
  }
}

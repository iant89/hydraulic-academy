import { G, clamp } from '../core/units';
import type { DumpBodyMechanismConfig } from './types';

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

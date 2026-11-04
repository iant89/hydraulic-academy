import { solveDense } from '../core/linalg';
import type { FlowElement, NodeInfo } from './types';

/**
 * Lumped-parameter hydraulic network.
 *
 * Every node carries a hydraulic capacitance C = V/β. For each time step the
 * node pressures are found with implicit (backward) Euler:
 *
 *    C_i (p_i − p_i,old)/Δt = Σ_e Q_e→i(p)
 *
 * solved with damped Newton iterations and a finite-difference Jacobian built
 * element-by-element. Implicit integration keeps the very stiff oil
 * compressibility stable at millisecond time steps and means a dead-headed
 * positive-displacement pump correctly drives pressure up until a relief
 * path opens (or a component fails).
 *
 * Pressures are gauge Pa. Free nodes are clamped at −0.99 bar gauge
 * (vapour-pressure limit). A node pinned at the limit represents a
 * cavitating void (e.g. the rod side of an overrunning cylinder); mass is
 * not conserved inside the void – an accepted simplification. Pump inlet
 * starvation is handled separately by the pump fill model.
 */
export const MIN_GAUGE_PRESSURE = -0.99e5;

export interface SolveResult {
  converged: boolean;
  iterations: number;
}

export class HydraulicNetwork {
  nodes: NodeInfo[] = [];
  elements: FlowElement[] = [];
  p = new Float64Array(0);
  private pOld = new Float64Array(0);
  /** flows into nodes for each element (after last solve) */
  elementFlows: Float64Array[] = [];
  /** net element flow INTO each node after the last solve (meaningful for boundaries) */
  nodeInflow = new Float64Array(0);
  private free: number[] = [];
  private freeIndex: Int32Array = new Int32Array(0);
  /** Elements touching each free unknown, for sparse-ish Jacobian assembly. */
  private scratch = new Float64Array(16);
  private scratch2 = new Float64Array(16);

  addNode(n: NodeInfo): number {
    this.nodes.push(n);
    return this.nodes.length - 1;
  }

  addElement(e: FlowElement) {
    this.elements.push(e);
  }

  finalize() {
    const n = this.nodes.length;
    const prev = this.p;
    this.p = new Float64Array(n);
    this.p.set(prev.subarray(0, Math.min(prev.length, n)));
    this.pOld = new Float64Array(n);
    this.nodeInflow = new Float64Array(n);
    this.free = [];
    this.freeIndex = new Int32Array(n).fill(-1);
    this.nodes.forEach((node, i) => {
      if (!node.boundary) {
        this.freeIndex[i] = this.free.length;
        this.free.push(i);
      }
    });
    this.elementFlows = this.elements.map((e) => new Float64Array(e.nodes.length));
    const maxN = Math.max(16, ...this.elements.map((e) => e.nodes.length));
    this.scratch = new Float64Array(maxN);
    this.scratch2 = new Float64Array(maxN);
  }

  private applyBoundaries() {
    this.nodes.forEach((node, i) => {
      if (node.boundary) this.p[i] = node.boundary();
    });
  }

  solve(dt: number, beta: number, maxIter = 60): SolveResult {
    const nf = this.free.length;
    this.applyBoundaries();
    this.pOld.set(this.p);
    if (nf === 0) {
      this.recordFlows();
      return { converged: true, iterations: 0 };
    }
    const C = new Float64Array(nf);
    for (let k = 0; k < nf; k++) C[k] = Math.max(this.nodes[this.free[k]!]!.volume, 1e-7) / beta;

    const J = new Float64Array(nf * nf);
    const r = new Float64Array(nf);
    const q0 = this.scratch;
    const q1 = this.scratch2;
    /** Residual r_k = C(p − p_old)/Δt − ΣQ_in. Returns its max-norm (scaled to m^3/s). */
    const residual = (out: Float64Array): number => {
      for (let k = 0; k < nf; k++) {
        const i = this.free[k]!;
        out[k] = (C[k]! * (this.p[i]! - this.pOld[i]!)) / dt;
      }
      for (const e of this.elements) {
        e.flow(this.p, q0);
        for (let a = 0; a < e.nodes.length; a++) {
          const ka = this.freeIndex[e.nodes[a]!]!;
          if (ka >= 0) out[ka] = out[ka]! - q0[a]!;
        }
      }
      let n = 0;
      for (let k = 0; k < nf; k++) n = Math.max(n, Math.abs(out[k]!));
      return n;
    };
    let converged = false;
    let it = 0;
    let rNorm = residual(r);
    const pPrev = new Float64Array(nf);
    const rTrial = new Float64Array(nf);
    for (; it < maxIter; it++) {
      J.fill(0);
      for (let k = 0; k < nf; k++) J[k * nf + k] = C[k]! / dt;
      for (const e of this.elements) {
        const m = e.nodes.length;
        e.flow(this.p, q0);
        const base = q0.slice(0, m);
        for (let b = 0; b < m; b++) {
          const nb = e.nodes[b]!;
          const kb = this.freeIndex[nb]!;
          if (kb < 0) continue;
          const pb = this.p[nb]!;
          const h = 5 + Math.abs(pb) * 1e-6;
          this.p[nb] = pb + h;
          e.flow(this.p, q1);
          this.p[nb] = pb;
          for (let a = 0; a < m; a++) {
            const ka = this.freeIndex[e.nodes[a]!]!;
            if (ka < 0) continue;
            J[ka * nf + kb] = J[ka * nf + kb]! - (q1[a]! - base[a]!) / h;
          }
        }
      }
      const rhs = new Float64Array(nf);
      for (let k = 0; k < nf; k++) rhs[k] = -r[k]!;
      const dx = solveDense(J, rhs, nf);
      if (!dx) break;
      let maxStep = 0;
      for (let k = 0; k < nf; k++) {
        // A node pinned at the vapour limit that wants to go lower is converged (cavitating void).
        const pinned = this.p[this.free[k]!]! <= MIN_GAUGE_PRESSURE && dx[k]! < 0;
        if (!pinned) maxStep = Math.max(maxStep, Math.abs(dx[k]!));
      }
      const limit = 40e5;
      let scale = maxStep > limit ? limit / maxStep : 1;
      for (let k = 0; k < nf; k++) pPrev[k] = this.p[this.free[k]!]!;
      // Backtracking line search on the residual norm.
      let accepted = false;
      for (let ls = 0; ls < 8; ls++) {
        for (let k = 0; k < nf; k++) {
          let v = pPrev[k]! + dx[k]! * scale;
          if (v < MIN_GAUGE_PRESSURE) v = MIN_GAUGE_PRESSURE;
          this.p[this.free[k]!] = v;
        }
        const n = residual(rTrial);
        if (n <= rNorm * (1 - 1e-4 * scale) || n < 1e-12 || ls === 7) {
          rNorm = n;
          r.set(rTrial);
          accepted = true;
          break;
        }
        scale *= 0.5;
      }
      if (!accepted) break;
      if (maxStep * scale < 20 || rNorm < 1e-11) {
        converged = true;
        it++;
        break;
      }
    }
    this.recordFlows();
    return { converged, iterations: it };
  }

  private recordFlows() {
    this.nodeInflow.fill(0);
    this.elements.forEach((e, idx) => {
      const out = this.elementFlows[idx]!;
      e.flow(this.p, out);
      e.nodes.forEach((n, a) => {
        this.nodeInflow[n] = this.nodeInflow[n]! + out[a]!;
      });
    });
  }

  elementIndex(id: string): number {
    return this.elements.findIndex((e) => e.id === id);
  }

  /** Flow through a 2-terminal element from terminal 0 to terminal 1 (m^3/s). */
  throughFlow(elementId: string): number {
    const i = this.elementIndex(elementId);
    if (i < 0) return 0;
    const f = this.elementFlows[i]!;
    return f.length >= 2 ? f[1]! : -f[0]!;
  }

  /** Heat generated by dissipative elements (W) = Σ Q·Δp. */
  dissipation(): number {
    let w = 0;
    this.elements.forEach((e, idx) => {
      if (!e.dissipative) return;
      const f = this.elementFlows[idx]!;
      // Power absorbed = Σ_terminals (−Q_into_i · p_i) = Σ Q_out_i p_i
      let pw = 0;
      e.nodes.forEach((n, a) => {
        pw -= f[a]! * this.p[n]!;
      });
      if (pw > 0) w += pw;
    });
    return w;
  }
}

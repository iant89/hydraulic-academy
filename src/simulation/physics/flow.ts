/**
 * Flow-resistance relationships used by elements.
 *
 * Orifice:   Q = Cd·A·sqrt(2|Δp|/ρ)·sign(Δp), regularised near Δp = 0 with a
 *            transition pressure so the derivative stays finite (this also
 *            stands in for laminar behaviour at very low Δp).
 * Line:      Δp = R·Q + K·Q·|Q| where R is Hagen–Poiseuille laminar resistance
 *            and K the turbulent/minor-loss term (Darcy f = 0.03 plus fitting
 *            losses). Solved exactly for Q.
 */
export const CD = 0.62;
const P_TRANSITION = 0.2e5; // Pa

export function orificeFlow(area: number, dp: number, rho: number, cd = CD): number {
  if (area <= 0) return 0;
  const k = cd * area * Math.sqrt(2 / rho);
  return (k * dp) / Math.sqrt(Math.abs(dp) + P_TRANSITION);
}

export function laminarResistance(mu: number, length: number, d: number): number {
  return (128 * mu * length) / (Math.PI * Math.pow(d, 4));
}

export function turbulentCoefficient(rho: number, length: number, d: number, fittingK = 1.5): number {
  const A = (Math.PI * d * d) / 4;
  const f = 0.03;
  return ((rho / 2) * (f * (length / d) + fittingK)) / (A * A);
}

/** Q for Δp across a line with Δp = R Q + K Q|Q| */
export function lineFlow(dp: number, R: number, K: number): number {
  const a = Math.abs(dp);
  if (K <= 0) return dp / R;
  const q = (-R + Math.sqrt(R * R + 4 * K * a)) / (2 * K);
  return dp >= 0 ? q : -q;
}

/** Laminar leakage path: Q = G·Δp scaled by viscosity ratio. */
export function leakFlow(conductance: number, dp: number, muRef: number, mu: number): number {
  return conductance * dp * (muRef / mu);
}

/**
 * Dense linear solve with partial pivoting (Gaussian elimination).
 * Circuits in this application have tens of nodes, for which a dense
 * solver is simpler and fast enough. Solves A x = b in place; returns x.
 * Returns null if the matrix is singular.
 */
export function solveDense(A: Float64Array, b: Float64Array, n: number): Float64Array | null {
  for (let k = 0; k < n; k++) {
    let piv = k;
    let max = Math.abs(A[k * n + k]!);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(A[i * n + k]!);
      if (v > max) {
        max = v;
        piv = i;
      }
    }
    if (max < 1e-300) return null;
    if (piv !== k) {
      for (let j = 0; j < n; j++) {
        const t = A[k * n + j]!;
        A[k * n + j] = A[piv * n + j]!;
        A[piv * n + j] = t;
      }
      const t = b[k]!;
      b[k] = b[piv]!;
      b[piv] = t;
    }
    const akk = A[k * n + k]!;
    for (let i = k + 1; i < n; i++) {
      const f = A[i * n + k]! / akk;
      if (f === 0) continue;
      for (let j = k; j < n; j++) A[i * n + j] = A[i * n + j]! - f * A[k * n + j]!;
      b[i] = b[i]! - f * b[k]!;
    }
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i]!;
    for (let j = i + 1; j < n; j++) s -= A[i * n + j]! * x[j]!;
    x[i] = s / A[i * n + i]!;
  }
  return x;
}

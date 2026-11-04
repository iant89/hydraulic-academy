/**
 * Hydraulic fluid property models.
 *
 * Approximations (documented):
 *  - Kinematic viscosity follows the Walther (ASTM D341) equation fitted
 *    through the ISO VG grade at 40 °C and a typical 100 °C value for a
 *    mineral oil with VI ≈ 100. Good to within a few % over 0–100 °C.
 *  - Density varies linearly with temperature (−0.065 %/K).
 *  - Effective bulk modulus includes hose compliance (fixed 1.0 GPa base)
 *    and is reduced by entrained air using a simple mixture rule.
 */
export interface FluidGrade {
  id: string;
  name: string;
  /** cSt at 40 °C */
  nu40: number;
  /** cSt at 100 °C */
  nu100: number;
  /** kg/m^3 at 15 °C */
  density15: number;
}

export const FLUID_GRADES: Record<string, FluidGrade> = {
  'iso-vg-32': { id: 'iso-vg-32', name: 'ISO VG 32 anti-wear hydraulic oil', nu40: 32, nu100: 5.4, density15: 870 },
  'iso-vg-46': { id: 'iso-vg-46', name: 'ISO VG 46 anti-wear hydraulic oil', nu40: 46, nu100: 6.8, density15: 875 },
  'iso-vg-68': { id: 'iso-vg-68', name: 'ISO VG 68 anti-wear hydraulic oil', nu40: 68, nu100: 8.7, density15: 880 },
  'sae-15w40': { id: 'sae-15w40', name: 'SAE 15W-40 engine oil (incorrect fluid)', nu40: 110, nu100: 14.5, density15: 885 },
  'atf': { id: 'atf', name: 'Automatic transmission fluid', nu40: 34, nu100: 7.4, density15: 860 },
};

function waltherCoeffs(g: FluidGrade) {
  const T1 = 40 + 273.15;
  const T2 = 100 + 273.15;
  const y1 = Math.log10(Math.log10(g.nu40 + 0.7));
  const y2 = Math.log10(Math.log10(g.nu100 + 0.7));
  const B = (y1 - y2) / (Math.log10(T2) - Math.log10(T1));
  const A = y1 + B * Math.log10(T1);
  return { A, B };
}

/** Kinematic viscosity in cSt (mm^2/s). */
export function kinematicViscosityCSt(g: FluidGrade, tempC: number): number {
  const { A, B } = waltherCoeffs(g);
  const T = Math.max(tempC, -30) + 273.15;
  const y = A - B * Math.log10(T);
  return Math.pow(10, Math.pow(10, y)) - 0.7;
}

export function density(g: FluidGrade, tempC: number): number {
  return g.density15 * (1 - 0.00065 * (tempC - 15));
}

/** Dynamic viscosity Pa·s */
export function dynamicViscosity(g: FluidGrade, tempC: number): number {
  return kinematicViscosityCSt(g, tempC) * 1e-6 * density(g, tempC);
}

export const BASE_BULK_MODULUS = 1.0e9;

export function effectiveBulkModulus(airFraction: number): number {
  return BASE_BULK_MODULUS * (1 - Math.min(0.85, airFraction * 12));
}

/** Specific heat J/(kg·K) – typical mineral oil. */
export const FLUID_CP = 1880;

export interface FluidProps {
  grade: FluidGrade;
  temperature: number;
  rho: number;
  mu: number;
  nuCSt: number;
  beta: number;
  /** Reference viscosity (Pa·s) at 50 °C for the specified grade; leakage paths scale by muRef/mu. */
  muRef: number;
}

export function fluidProps(grade: FluidGrade, tempC: number, airFraction: number, refGrade: FluidGrade = grade): FluidProps {
  return {
    grade,
    temperature: tempC,
    rho: density(grade, tempC),
    mu: dynamicViscosity(grade, tempC),
    nuCSt: kinematicViscosityCSt(grade, tempC),
    beta: effectiveBulkModulus(airFraction),
    muRef: dynamicViscosity(refGrade, 50),
  };
}

/**
 * Unit conversions. The simulation engine works exclusively in SI units:
 *   pressure Pa (gauge unless stated), flow m^3/s, length m, area m^2,
 *   volume m^3, force N, temperature °C (absolute where noted), speed rev/min
 *   for rotating shafts (rpm is the industry convention; converted to rev/s
 *   inside formulas), viscosity Pa·s (dynamic) or m^2/s (kinematic).
 * Display conversion happens only at the UI boundary.
 */
export const BAR = 1e5;
export const PSI = 6894.757293168;
export const LPM = 1 / 60000; // 1 L/min in m^3/s
export const GPM = 3.785411784e-3 / 60; // US gal/min in m^3/s
export const LITRE = 1e-3;
export const MM = 1e-3;
export const INCH = 0.0254;
export const CC = 1e-6; // cm^3
export const ATM_ABS = 101325;
export const G = 9.80665;

export type UnitSystem = 'metric' | 'imperial';

export type Quantity =
  | 'pressure'
  | 'flow'
  | 'length'
  | 'smallLength'
  | 'volume'
  | 'force'
  | 'temperature'
  | 'speed'
  | 'displacement'
  | 'power'
  | 'velocity'
  | 'area'
  | 'mass'
  | 'ratio'
  | 'rpm'
  | 'time'
  | 'voltage'
  | 'resistance'
  | 'torque'
  | 'none';

interface UnitDef {
  label: string;
  fromSI: (v: number) => number;
  toSI: (v: number) => number;
  digits: number;
}

const id = (v: number) => v;
const lin = (k: number, label: string, digits: number): UnitDef => ({
  label,
  fromSI: (v) => v / k,
  toSI: (v) => v * k,
  digits,
});

const UNITS: Record<UnitSystem, Record<Quantity, UnitDef>> = {
  metric: {
    pressure: lin(BAR, 'bar', 1),
    flow: lin(LPM, 'L/min', 1),
    length: lin(1, 'm', 2),
    smallLength: lin(MM, 'mm', 0),
    volume: lin(LITRE, 'L', 1),
    force: lin(1000, 'kN', 1),
    temperature: { label: '°C', fromSI: id, toSI: id, digits: 1 },
    speed: lin(1, 'rpm', 0),
    displacement: lin(CC, 'cm³/rev', 1),
    power: lin(1000, 'kW', 2),
    velocity: lin(MM, 'mm/s', 0),
    area: lin(1e-4, 'cm²', 1),
    mass: lin(1, 'kg', 0),
    ratio: lin(1, '', 2),
    rpm: lin(1, 'rpm', 0),
    time: lin(1, 's', 1),
    voltage: lin(1, 'V', 2),
    resistance: lin(1, 'Ω', 1),
    torque: lin(1, 'N·m', 0),
    none: lin(1, '', 2),
  },
  imperial: {
    pressure: lin(PSI, 'psi', 0),
    flow: lin(GPM, 'gpm', 1),
    length: lin(0.3048, 'ft', 2),
    smallLength: lin(INCH, 'in', 2),
    volume: lin(3.785411784e-3, 'gal', 2),
    force: lin(4448.2216, 'kip', 2),
    temperature: { label: '°F', fromSI: (c) => (c * 9) / 5 + 32, toSI: (f) => ((f - 32) * 5) / 9, digits: 0 },
    speed: lin(1, 'rpm', 0),
    displacement: lin(16.387064e-6, 'in³/rev', 2),
    power: lin(745.69987, 'hp', 1),
    velocity: lin(INCH, 'in/s', 1),
    area: lin(INCH * INCH, 'in²', 2),
    mass: lin(0.45359237, 'lb', 0),
    ratio: lin(1, '', 2),
    rpm: lin(1, 'rpm', 0),
    time: lin(1, 's', 1),
    voltage: lin(1, 'V', 2),
    resistance: lin(1, 'Ω', 1),
    torque: lin(1.3558179, 'lb·ft', 0),
    none: lin(1, '', 2),
  },
};

export function unitDef(q: Quantity, system: UnitSystem): UnitDef {
  return UNITS[system][q];
}

export function toDisplay(value: number, q: Quantity, system: UnitSystem): number {
  return UNITS[system][q].fromSI(value);
}

export function fromDisplay(value: number, q: Quantity, system: UnitSystem): number {
  return UNITS[system][q].toSI(value);
}

export function formatQuantity(value: number, q: Quantity, system: UnitSystem, digits?: number): string {
  const u = UNITS[system][q];
  if (!Number.isFinite(value)) return `— ${u.label}`.trim();
  const v = u.fromSI(value);
  const d = digits ?? u.digits;
  return `${v.toFixed(d)}${u.label ? ' ' + u.label : ''}`;
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const circleArea = (d: number) => (Math.PI * d * d) / 4;

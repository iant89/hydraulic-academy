/**
 * 3D presentation data for the service-truck crane (visual only).
 * World frame: x forward, y up, z lateral (curb side = −z).
 */
export const CRANE_AXIS: [number, number, number] = [0.3, 2.15, -0.85];
export const STABILIZER_POS: [number, number] = [-0.4, -1.32];
export const VALVE_BANK_POS: [number, number, number] = [0.45, 0.95, -1.27];
export const RESERVOIR_POS: [number, number, number] = [5.12, 1.55, 0.25];

export const CRANE_HOSE_ROUTES: Record<string, [number, number, number][]> = {
  suction: [[5.12, 1.08, 0.12], [4.95, 0.75, -0.1], [4.6, 0.62, -0.35], [4.55, 0.68, -0.42]],
  pressure: [[4.55, 0.92, -0.42], [4.2, 1.0, -0.55], [2.5, 0.95, -0.62], [1.0, 0.92, -0.95], [0.62, 0.95, -1.18]],
  return: [[0.28, 0.85, -1.2], [1.0, 0.8, -0.6], [3.0, 0.82, -0.2], [4.8, 1.2, 0.3], [4.95, 1.62, 0.48]],
  'filter-out': [[5.0, 1.85, 0.48], [5.08, 2.0, 0.35], [5.12, 1.95, 0.25]],
  'lift-a': [[0.5, 1.05, -1.2], [0.42, 1.5, -1.0], [0.32, 1.95, -0.9]],
  'winch-a': [[0.42, 1.05, -1.2], [0.36, 1.5, -1.02], [0.28, 1.95, -0.92]],
  'slew-a': [[0.36, 1.05, -1.2], [0.3, 1.5, -1.05], [0.24, 1.95, -0.95]],
  'out-a': [[0.3, 0.9, -1.27], [0.0, 0.95, -1.3], [-0.3, 1.1, -1.32]],
};

/**
 * 3D presentation data for the dump truck (visual only – no simulation
 * logic). World frame: x forward, y up, z lateral (+z = right side).
 */
export const HINGE: [number, number, number] = [0, 1.75, 0];
export const IP_Y_OFFSET = 0.55;

export const COMPONENT_POS: Record<string, [number, number, number]> = {
  pump: [4.45, 0.8, -0.45],
  pto: [5.0, 0.8, -0.32],
  tank: [3.3, 0.85, -0.85],
  filter: [2.4, 0.8, -0.95],
  cooler: [1.6, 0.85, -0.98],
  dcv: [3.9, 0.95, 0.55],
  relief: [3.65, 0.95, 0.72],
};

/** Hose routes (world points). The work hose terminates at the fixed cylinder base. */
export const HOSE_ROUTES: Record<string, [number, number, number][]> = {
  suction: [[3.1, 0.62, -0.6], [3.6, 0.55, -0.55], [4.2, 0.6, -0.5], [4.38, 0.72, -0.46]],
  pressure: [[4.45, 0.95, -0.4], [4.3, 1.05, -0.1], [4.1, 1.0, 0.3], [3.95, 0.98, 0.48]],
  'relief-supply': [[3.85, 0.92, 0.6], [3.72, 0.93, 0.68]],
  'relief-return': [[3.6, 0.9, 0.75], [3.2, 0.62, 0.5], [2.8, 0.6, -0.4], [2.45, 0.7, -0.9]],
  work: [[3.95, 1.05, 0.5], [4.05, 0.7, 0.3], [4.0, 0.42, 0.12], [4.0, 0.38, 0.0]],
  return: [[3.85, 0.88, 0.5], [3.4, 0.58, 0.3], [2.9, 0.55, -0.5], [2.45, 0.68, -0.92]],
  'filter-out': [[2.35, 0.95, -0.95], [2.0, 1.0, -0.98], [1.7, 1.0, -0.98]],
  'cooler-out': [[1.55, 0.65, -0.98], [2.2, 0.5, -0.9], [2.9, 0.6, -0.9], [3.05, 0.9, -0.85]],
  'ft-in': [[4.45, 0.95, -0.4], [4.6, 1.3, -1.4], [4.2, 1.2, -1.8]],
  'ft-out': [[4.0, 1.2, -1.8], [3.9, 1.3, -0.4], [3.95, 0.98, 0.48]],
};

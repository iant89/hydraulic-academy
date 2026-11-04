import { BAR, MM } from '../core/units';
import type { CircuitDefinition, ConnectionDefinition, HoseSpec, LineType } from '../hydraulics/types';

export const hose = (dMm: number, length: number, ratingBar = 207, construction: HoseSpec['construction'] = 'hose'): HoseSpec => ({
  innerDiameter: dMm * MM,
  length,
  workingPressure: ratingBar * BAR,
  construction,
});

export function conn(
  id: string,
  from: string,
  to: string,
  lineType: LineType,
  h: HoseSpec,
  label?: string,
): ConnectionDefinition {
  const [fc, fp] = from.split('.') as [string, string];
  const [tc, tp] = to.split('.') as [string, string];
  return { id, from: { component: fc, port: fp }, to: { component: tc, port: tp }, lineType, hose: h, label: label ?? id };
}

/** Basic training circuit: reservoir → gear pump → relief → 4/3 valve → double-acting cylinder. */
export function basicCylinderCircuit(): CircuitDefinition {
  return {
    id: 'basic-cylinder',
    name: 'Basic double-acting cylinder circuit',
    fluidGrade: 'iso-vg-46',
    components: [
      { id: 'tank', type: 'reservoir', label: 'Reservoir', params: { capacity: 60, initialVolume: 50, height: 0.4 }, layout: { x: 2, y: 13 } },
      { id: 'pump', type: 'pump-gear', label: 'Gear pump', params: { displacement: 16, speed: 1500, ratedSpeed: 2500 }, layout: { x: 2, y: 9 } },
      { id: 'relief', type: 'relief-valve', label: 'Relief valve', params: { crackingPressure: 140, ratedFlow: 60 }, layout: { x: 7, y: 9 } },
      { id: 'dcv', type: 'dcv', label: 'Directional valve', params: { variant: '4-3-tandem', ratedFlow: 60 }, layout: { x: 12, y: 7 } },
      { id: 'cyl', type: 'cylinder', label: 'Cylinder', params: { bore: 63, rod: 36, stroke: 0.4, externalLoad: 10000 }, layout: { x: 12, y: 2 } },
      { id: 'filter', type: 'filter', label: 'Return filter', params: { ratedFlow: 60 }, layout: { x: 16, y: 11 } },
      { id: 'gauge', type: 'gauge', label: 'Pump pressure gauge', params: {}, layout: { x: 5, y: 6 } },
    ],
    connections: [
      conn('suction', 'tank.S', 'pump.IN', 'suction', hose(32, 0.8, 10, 'suction-hose'), 'Suction line'),
      conn('pressure', 'pump.OUT', 'dcv.P', 'pressure', hose(12.7, 1.5), 'Pump pressure line'),
      conn('relief-in', 'pump.OUT', 'relief.P', 'pressure', hose(12.7, 0.3), 'Relief supply'),
      conn('relief-out', 'relief.T', 'tank.R', 'return', hose(16, 1.0, 20), 'Relief return'),
      conn('gauge-line', 'pump.OUT', 'gauge.G', 'pressure', hose(6, 0.5, 400), 'Gauge line'),
      conn('work-a', 'dcv.A', 'cyl.A', 'work', hose(12.7, 2), 'Cylinder extend line'),
      conn('work-b', 'dcv.B', 'cyl.B', 'work', hose(12.7, 2), 'Cylinder retract line'),
      conn('return', 'dcv.T', 'filter.IN', 'return', hose(19, 1.0, 20), 'Valve return'),
      conn('filter-out', 'filter.OUT', 'tank.R', 'return', hose(19, 0.5, 20), 'Filter to tank'),
    ],
  };
}

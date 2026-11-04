import { conn, hose } from '@/simulation/circuits/library';
import type { CircuitDefinition, ComponentInstanceDefinition, ConnectionDefinition } from '@/simulation/hydraulics/types';

export interface CircuitExercise {
  id: string;
  title: string;
  brief: string;
  goals: string[];
  /** Components placed for the technician (usually unconnected). */
  start: () => CircuitDefinition;
  /** Reference connections (the correct circuit). */
  reference: () => ConnectionDefinition[];
  hint: string;
  /** Operating check: input to apply and what should move. */
  check?: { component: string; input: string; value: number; expect: { component: string; key: string; min: number } };
}

const C = (id: string, type: string, label: string, x: number, y: number, params: ComponentInstanceDefinition['params'] = {}): ComponentInstanceDefinition => ({ id, type, label, params, layout: { x, y } });
const tank = () => C('tank', 'reservoir', 'Reservoir', 1, 11, { capacity: 80, initialVolume: 60, height: 0.4 });
const pump = () => C('pump', 'pump-gear', 'Pump', 1.5, 6.5, { displacement: 16, speed: 1500, ratedSpeed: 2500 });
const relief = (s = 140) => C('relief', 'relief-valve', 'Relief valve', 5.5, 6.5, { crackingPressure: s, ratedFlow: 60 });
const circuit = (id: string, components: ComponentInstanceDefinition[], connections: ConnectionDefinition[] = []): CircuitDefinition => ({ id, name: id, fluidGrade: 'iso-vg-46', components, connections });
const S = () => conn('s', 'tank.S', 'pump.IN', 'suction', hose(32, 0.6, 10, 'suction-hose'));
const P = (to: string, id = 'p') => conn(id, 'pump.OUT', to, 'pressure', hose(12.7, 1.5));
const RV = () => [conn('rv', 'pump.OUT', 'relief.P', 'pressure', hose(12.7, 0.3)), conn('rvt', 'relief.T', 'tank.R', 'return', hose(16, 1, 207))];
const W = (id: string, a: string, b: string) => conn(id, a, b, 'work', hose(12.7, 1.5));
const T = (id: string, a: string, b = 'tank.R') => conn(id, a, b, 'return', hose(16, 1, 207));

const dcv43 = (variant = '4-3-tandem', id = 'dcv', x = 9, y = 4.5) => C(id, 'dcv', id === 'dcv' ? 'Directional valve' : `Valve ${id.slice(-1)}`, x, y, { variant, ratedFlow: 60, actuation: 'lever' });
const cylDA = (id = 'cyl', x = 9, y = 0.5, load = 8000) => C(id, 'cylinder', id === 'cyl' ? 'Double-acting cylinder' : `Cylinder ${id.slice(-1)}`, x, y, { bore: 63, rod: 36, stroke: 0.5, externalLoad: load });

export const EXERCISES: CircuitExercise[] = [
  {
    id: 'ex1-basic',
    title: '1. Basic pump and cylinder circuit',
    brief: 'Connect a gear pump, relief valve and 3-way valve to raise and lower a single-acting cylinder by gravity.',
    goals: ['Pump draws only from the reservoir S port', 'Relief protects the pump outlet', 'Valve P from pump, T to tank, A to cylinder'],
    start: () => circuit('ex1', [tank(), pump(), relief(), C('dcv', 'dcv', '3-way valve', 9, 4.5, { variant: '3way-dump', ratedFlow: 60, actuation: 'lever' }), C('cyl', 'cylinder', 'Single-acting cylinder', 9, 0.5, { singleActing: true, bore: 63, stroke: 0.5, externalLoad: 8000 })]),
    reference: () => [S(), P('dcv.P'), ...RV(), W('a', 'dcv.A', 'cyl.A'), T('t', 'dcv.T')],
    hint: 'Every pump needs a relief valve connected directly to its outlet. Return lines go to the reservoir R port.',
    check: { component: 'dcv', input: 'command', value: 1, expect: { component: 'cyl', key: 'velocity', min: 0.02 } },
  },
  {
    id: 'ex2-dcv',
    title: '2. Directional control valve circuit',
    brief: 'Use a 4/3 tandem-centre valve to extend and retract a double-acting cylinder.',
    goals: ['A to cap end, B to rod end', 'Tandem centre unloads the pump in neutral'],
    start: () => circuit('ex2', [tank(), pump(), relief(), dcv43(), cylDA()]),
    reference: () => [S(), P('dcv.P'), ...RV(), W('a', 'dcv.A', 'cyl.A'), W('b', 'dcv.B', 'cyl.B'), T('t', 'dcv.T')],
    hint: 'Check the port markings on the valve (P, T, A, B) – not the colour of the hose.',
    check: { component: 'dcv', input: 'command', value: 1, expect: { component: 'cyl', key: 'velocity', min: 0.05 } },
  },
  {
    id: 'ex3-relief',
    title: '3. Pressure relief circuit',
    brief: 'Pump through a needle valve (the load) with a relief valve and gauge protecting the pump.',
    goals: ['Relief between pump outlet and tank', 'Gauge reads pump pressure'],
    start: () => circuit('ex3', [tank(), pump(), relief(100), C('needle', 'flow-control', 'Needle valve (load)', 10, 5, { opening: 0.2, maxArea: 30 }), C('g', 'gauge', 'Gauge', 5, 2, { range: 250 })]),
    reference: () => [S(), P('needle.IN'), ...RV(), conn('g', 'pump.OUT', 'g.G', 'pressure', hose(6, 0.5, 400)), T('t', 'needle.OUT')],
    hint: 'The relief valve P port must see pump pressure at all times; its T port goes straight to tank.',
  },
  {
    id: 'ex4-double',
    title: '4. Double-acting cylinder with return filtration',
    brief: 'As exercise 2, but all valve return flow must pass through the return filter.',
    goals: ['Valve T → filter IN', 'Filter OUT → reservoir R'],
    start: () => circuit('ex4', [tank(), pump(), relief(), dcv43(), cylDA(), C('filter', 'filter', 'Return filter', 14, 7, { ratedFlow: 60 })]),
    reference: () => [S(), P('dcv.P'), ...RV(), W('a', 'dcv.A', 'cyl.A'), W('b', 'dcv.B', 'cyl.B'), conn('t', 'dcv.T', 'filter.IN', 'return', hose(16, 1, 207)), T('f', 'filter.OUT')],
    hint: 'Filters have an inlet and outlet – flow direction matters.',
    check: { component: 'dcv', input: 'command', value: 1, expect: { component: 'cyl', key: 'velocity', min: 0.05 } },
  },
  {
    id: 'ex5-motor',
    title: '5. Hydraulic motor circuit',
    brief: 'Drive a bi-directional motor with an open-centre valve. The motor has an external case drain.',
    goals: ['Motor A/B to valve A/B', 'Case drain directly to reservoir D port – never into the pressure or return line'],
    start: () => circuit('ex5', [tank(), pump(), relief(), dcv43('4-3-open'), C('motor', 'motor', 'Hydraulic motor', 9.5, 0.5, { displacement: 50, caseDrain: true, loadTorque: 20 })]),
    reference: () => [S(), P('dcv.P'), ...RV(), W('a', 'dcv.A', 'motor.A'), W('b', 'dcv.B', 'motor.B'), T('t', 'dcv.T'), conn('cd', 'motor.CD', 'tank.D', 'case-drain', hose(10, 2, 20))],
    hint: 'A plugged or restricted case drain pressurises the motor housing and blows the shaft seal.',
    check: { component: 'dcv', input: 'command', value: 1, expect: { component: 'motor', key: 'speed', min: 50 } },
  },
  {
    id: 'ex6-multi',
    title: '6. Multiple-function circuit',
    brief: 'Supply two closed-centre valves in parallel from one pump, each controlling its own cylinder.',
    goals: ['Both valve P ports on the pump line', 'Both T ports to tank'],
    start: () => circuit('ex6', [tank(), pump(), relief(), dcv43('4-3-closed', 'dcv1', 8, 4.5), dcv43('4-3-closed', 'dcv2', 13, 4.5), cylDA('cyl1', 8, 0.5), cylDA('cyl2', 13, 0.5, 15000)]),
    reference: () => [S(), P('dcv1.P', 'p1'), P('dcv2.P', 'p2'), ...RV(), W('a1', 'dcv1.A', 'cyl1.A'), W('b1', 'dcv1.B', 'cyl1.B'), W('a2', 'dcv2.A', 'cyl2.A'), W('b2', 'dcv2.B', 'cyl2.B'), T('t1', 'dcv1.T'), T('t2', 'dcv2.T')],
    hint: 'Closed-centre valves block P in neutral – the relief valve passes pump flow when both are in neutral.',
  },
  {
    id: 'ex7-load',
    title: '7. Load-holding circuit (counterbalance)',
    brief: 'Insert a counterbalance valve between the valve A port and the cylinder cap end, piloted from the rod-end line.',
    goals: ['Valve A → CB V port; CB C (load) port → cylinder A', 'CB pilot X → valve B / rod-end line'],
    start: () => circuit('ex7', [tank(), pump(), relief(160), dcv43('4-3-float', 'dcv', 9, 6), cylDA('cyl', 9, 0.5, 20000), C('cb', 'counterbalance', 'Counterbalance valve', 8.5, 2.6, { setting: 120, pilotRatio: 4 })]),
    reference: () => [S(), P('dcv.P'), ...RV(), conn('a', 'dcv.A', 'cb.V', 'work', hose(12.7, 1)), conn('c', 'cb.L', 'cyl.A', 'work', hose(12.7, 0.5)), W('b', 'dcv.B', 'cyl.B'), conn('x', 'cb.X', 'cyl.B', 'pilot', hose(6, 1, 207)), T('t', 'dcv.T')],
    hint: 'Mount the counterbalance as close to the cylinder as possible. Its pilot comes from the opposite line.',
  },
  {
    id: 'ex8-fix',
    title: '8. Find and fix an incorrectly connected circuit',
    brief: 'This circuit was assembled without checking port markings. Find every error and correct it BEFORE running it.',
    goals: ['Identify each incorrect connection', 'Explain what would happen', 'Correct it'],
    start: () =>
      circuit(
        'ex8',
        [tank(), pump(), relief(), dcv43(), cylDA()],
        [
          conn('s', 'tank.R', 'pump.IN', 'suction', hose(32, 0.6, 10, 'suction-hose'), 'Suction hose'),
          conn('p', 'pump.OUT', 'dcv.T', 'pressure', hose(12.7, 1.5), 'Pressure hose'),
          conn('rv', 'dcv.P', 'relief.P', 'pressure', hose(12.7, 0.3), 'Relief supply'),
          conn('rvt', 'relief.T', 'tank.R', 'return', hose(16, 1, 207), 'Relief return'),
          conn('a', 'dcv.A', 'cyl.B', 'work', hose(12.7, 1.5), 'Hose A'),
          conn('b', 'dcv.B', 'cyl.A', 'work', hose(12.7, 1.5), 'Hose B'),
          conn('t', 'dcv.P', 'tank.S', 'return', hose(16, 1, 207), 'Return hose'),
        ],
      ),
    reference: () => [S(), P('dcv.P'), conn('rv', 'dcv.P', 'relief.P', 'pressure', hose(12.7, 0.3)), conn('rvt', 'relief.T', 'tank.R', 'return', hose(16, 1, 207)), W('a', 'dcv.A', 'cyl.A'), W('b', 'dcv.B', 'cyl.B'), T('t', 'dcv.T')],
    hint: 'Look at the validation findings – each one explains what is wrong, why, and what would happen.',
  },
];

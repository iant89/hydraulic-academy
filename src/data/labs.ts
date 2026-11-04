import { BAR } from '@/simulation/core/units';
import { conn, hose } from '@/simulation/circuits/library';
import type { CircuitDefinition, ComponentInstanceDefinition, ConnectionDefinition } from '@/simulation/hydraulics/types';
import type { LabControl, LabReadout } from '@/components/circuit/CircuitLab';

export interface Lab {
  id: string;
  title: string;
  objective: string;
  circuit: () => CircuitDefinition;
  controls: LabControl[];
  readouts: LabReadout[];
  steps: string[];
  expected: string[];
  explanation: string;
  question?: { q: string; options: string[]; answer: number; why: string };
}

const C = (id: string, type: string, label: string, x: number, y: number, params: ComponentInstanceDefinition['params'] = {}): ComponentInstanceDefinition => ({ id, type, label, params, layout: { x, y } });
const circuit = (id: string, name: string, components: ComponentInstanceDefinition[], connections: ConnectionDefinition[]): CircuitDefinition => ({ id, name, fluidGrade: 'iso-vg-46', components, connections });
const suction = (to = 'pump.IN') => conn('suction', 'tank.S', to, 'suction', hose(32, 0.6, 10, 'suction-hose'), 'Suction');
const tank = (x = 1, y = 10, vol = 60) => C('tank', 'reservoir', 'Reservoir', x, y, { capacity: vol + 20, initialVolume: vol, height: 0.4 });

const cylCircuit = (opts: { displacement?: number; bore?: number; load?: number; relief?: number; filter?: boolean } = {}) =>
  circuit(
    'lab-cyl',
    'Pump, relief, valve and cylinder',
    [
      tank(),
      C('pump', 'pump-gear', 'Pump', 1.5, 6, { displacement: opts.displacement ?? 16, speed: 1500, ratedSpeed: 2500 }),
      C('relief', 'relief-valve', 'Relief', 6, 6, { crackingPressure: opts.relief ?? 140, ratedFlow: 60 }),
      C('dcv', 'dcv', 'Directional valve', 9, 4, { variant: '4-3-tandem', ratedFlow: 60 }),
      C('cyl', 'cylinder', 'Cylinder', 9, 0.5, { bore: opts.bore ?? 63, rod: 36, stroke: 0.5, externalLoad: opts.load ?? 10000 }),
      ...(opts.filter ? [C('filter', 'filter', 'Return filter', 15, 7, { ratedFlow: 40, cleanDp: 0.3, bypass: 1.7 })] : []),
      C('g1', 'gauge', 'Pump gauge', 4, 2, { range: 250 }),
    ],
    [
      suction(),
      conn('pressure', 'pump.OUT', 'dcv.P', 'pressure', hose(12.7, 2)),
      conn('relief-in', 'pump.OUT', 'relief.P', 'pressure', hose(12.7, 0.3)),
      conn('relief-out', 'relief.T', 'tank.R', 'return', hose(16, 1, 207)),
      conn('gauge', 'pump.OUT', 'g1.G', 'pressure', hose(6, 0.5, 400)),
      conn('work-a', 'dcv.A', 'cyl.A', 'work', hose(12.7, 2)),
      conn('work-b', 'dcv.B', 'cyl.B', 'work', hose(12.7, 2)),
      ...(opts.filter
        ? [conn('return', 'dcv.T', 'filter.IN', 'return', hose(16, 1, 207)), conn('filter-out', 'filter.OUT', 'tank.R', 'return', hose(16, 1, 207))]
        : [conn('return', 'dcv.T', 'tank.R', 'return', hose(16, 1, 207))]),
    ],
  );

const orificeCircuit = () =>
  circuit(
    'lab-orifice',
    'Pump into a restriction',
    [tank(), C('pump', 'pump-gear', 'Pump', 1.5, 6, { displacement: 10, speed: 1500, ratedSpeed: 3000 }), C('relief', 'relief-valve', 'Relief', 6, 6, { crackingPressure: 200, ratedFlow: 40 }), C('orifice', 'orifice', 'Adjustable restriction', 10, 4, { diameter: 6 }), C('g1', 'gauge', 'Pump gauge', 4, 2, { range: 250 })],
    [
      suction(),
      conn('line', 'pump.OUT', 'orifice.IN', 'pressure', hose(12.7, 2)),
      conn('relief-in', 'pump.OUT', 'relief.P', 'pressure', hose(12.7, 0.3)),
      conn('relief-out', 'relief.T', 'tank.R', 'return', hose(16, 1, 207)),
      conn('gauge', 'pump.OUT', 'g1.G', 'pressure', hose(6, 0.5, 400)),
      conn('return', 'orifice.OUT', 'tank.R', 'return', hose(16, 1, 207)),
    ],
  );

const reliefCircuit = () =>
  circuit(
    'lab-relief',
    'Relief valve operation',
    [tank(), C('pump', 'pump-gear', 'Pump', 1.5, 6, { displacement: 16, speed: 1500 }), C('relief', 'relief-valve', 'Relief', 6, 6, { crackingPressure: 120, ratedFlow: 40, override: 10 }), C('needle', 'flow-control', 'Load (needle valve)', 10, 4, { opening: 1, maxArea: 30 }), C('g1', 'gauge', 'Pump gauge', 4, 2, { range: 250 })],
    [
      suction(),
      conn('line', 'pump.OUT', 'needle.IN', 'pressure', hose(12.7, 2)),
      conn('relief-in', 'pump.OUT', 'relief.P', 'pressure', hose(12.7, 0.3)),
      conn('relief-out', 'relief.T', 'tank.R', 'return', hose(16, 1, 207)),
      conn('gauge', 'pump.OUT', 'g1.G', 'pressure', hose(6, 0.5, 400)),
      conn('return', 'needle.OUT', 'tank.R', 'return', hose(16, 1, 207)),
    ],
  );

const pumpTestCircuit = () =>
  circuit(
    'lab-pumptest',
    'Pump flow test',
    [tank(1, 10, 80), C('pump', 'pump-gear', 'Pump under test', 1.5, 6, { displacement: 40, speed: 1500, ratedSpeed: 2500 }), C('ft', 'flow-meter', 'Flow tester + load valve', 6, 3, { load: 0 }), C('relief', 'relief-valve', 'Safety relief', 10, 6, { crackingPressure: 230, ratedFlow: 100 })],
    [
      suction(),
      conn('line', 'pump.OUT', 'ft.IN', 'pressure', hose(19, 1.5, 276)),
      conn('relief-in', 'pump.OUT', 'relief.P', 'pressure', hose(19, 0.4, 276)),
      conn('relief-out', 'relief.T', 'tank.R', 'return', hose(19, 1, 207)),
      conn('return', 'ft.OUT', 'tank.R', 'return', hose(25, 1, 207)),
    ],
  );

const manualPumpCircuit = () =>
  circuit(
    'lab-manual',
    'Manual hand pump and ram',
    [tank(1, 10, 10), C('pump', 'pump-manual', 'Hand pump', 1.5, 6, { displacement: 12, speed: 0 }), C('check', 'check-valve', 'Load check', 5, 4, { crack: 0.3, ratedFlow: 20 }), C('release', 'flow-control', 'Release valve', 9, 6, { opening: 0, maxArea: 4 }), C('cyl', 'cylinder', 'Single-acting ram', 4, 0, { singleActing: true, bore: 50, stroke: 0.15, externalLoad: 20000 }), C('g1', 'gauge', 'Gauge', 8, 1.5, { range: 400 })],
    [
      suction(),
      conn('p1', 'pump.OUT', 'check.IN', 'pressure', hose(6, 0.5, 700)),
      conn('p2', 'check.OUT', 'cyl.A', 'work', hose(6, 1, 700)),
      conn('g', 'check.OUT', 'g1.G', 'pressure', hose(6, 0.3, 700)),
      conn('rel', 'check.OUT', 'release.IN', 'pressure', hose(6, 0.5, 700)),
      conn('ret', 'release.OUT', 'tank.R', 'return', hose(10, 1, 207)),
    ],
  );

const twoActuatorCircuit = () =>
  circuit(
    'lab-two',
    'Two actuators sharing one pump',
    [
      tank(1, 11, 80),
      C('pump', 'pump-gear', 'Pump', 1.5, 7, { displacement: 16, speed: 1500 }),
      C('relief', 'relief-valve', 'Relief', 5, 7, { crackingPressure: 150, ratedFlow: 60 }),
      C('dcv1', 'dcv', 'Valve 1', 8, 4.5, { variant: '4-3-closed', ratedFlow: 60 }),
      C('dcv2', 'dcv', 'Valve 2', 13, 4.5, { variant: '4-3-closed', ratedFlow: 60 }),
      C('cyl1', 'cylinder', 'Cylinder 1 (light load)', 8, 0.5, { bore: 50, rod: 28, stroke: 0.4, externalLoad: 5000 }),
      C('cyl2', 'cylinder', 'Cylinder 2 (heavy load)', 13, 0.5, { bore: 50, rod: 28, stroke: 0.4, externalLoad: 20000 }),
    ],
    [
      suction(),
      conn('p1', 'pump.OUT', 'dcv1.P', 'pressure', hose(12.7, 2)),
      conn('p2', 'pump.OUT', 'dcv2.P', 'pressure', hose(12.7, 3)),
      conn('relief-in', 'pump.OUT', 'relief.P', 'pressure', hose(12.7, 0.3)),
      conn('relief-out', 'relief.T', 'tank.R', 'return', hose(16, 1, 207)),
      conn('a1', 'dcv1.A', 'cyl1.A', 'work', hose(12.7, 1.5)),
      conn('b1', 'dcv1.B', 'cyl1.B', 'work', hose(12.7, 1.5)),
      conn('a2', 'dcv2.A', 'cyl2.A', 'work', hose(12.7, 1.5)),
      conn('b2', 'dcv2.B', 'cyl2.B', 'work', hose(12.7, 1.5)),
      conn('t1', 'dcv1.T', 'tank.R', 'return', hose(16, 1.5, 207)),
      conn('t2', 'dcv2.T', 'tank.R', 'return', hose(16, 2.5, 207)),
    ],
  );

const pumpSpeed: LabControl = { kind: 'input', label: 'Pump speed', component: 'pump', key: 'speed', min: 0, max: 3000, step: 10, quantity: 'rpm' };
const valveCmd: LabControl = { kind: 'input', label: 'Valve command (−1 retract / 0 / +1 extend)', component: 'dcv', key: 'command', min: -1, max: 1, step: 1, quantity: 'ratio' };
const load: LabControl = { kind: 'input', label: 'External load on rod', component: 'cyl', key: 'externalForce', min: 0, max: 60000, step: 500, quantity: 'force' };

export const EXPERIMENTS: Lab[] = [
  {
    id: 'pressure-vs-flow',
    title: 'Pressure versus flow',
    objective: 'Show that a positive-displacement pump creates FLOW; pressure only appears when that flow meets resistance.',
    circuit: orificeCircuit,
    controls: [pumpSpeed, { kind: 'input', label: 'Restriction diameter (mm)', component: 'orifice', key: 'diameter', min: 1.2, max: 12, step: 0.1, quantity: 'none' }],
    readouts: [
      { kind: 'pressure', label: 'Pump pressure', component: 'pump', port: 'OUT' },
      { kind: 'flow', label: 'Flow through restriction', connection: 'line' },
      { kind: 'readout', label: 'Relief flow', component: 'relief', key: 'flow', quantity: 'flow' },
    ],
    steps: ['Leave the restriction wide open – note pressure and flow.', 'Close the restriction step by step and record each point.', 'Double the pump speed with the restriction fixed.'],
    expected: ['Flow stays almost constant as the restriction closes (until the relief opens).', 'Pressure rises roughly with the square of flow through a fixed orifice.', 'Doubling speed doubles flow and roughly quadruples pressure drop across the same orifice.'],
    explanation: 'Pumps produce flow (Q = Vd × n). Pressure is the resistance to that flow. A gauge reads high pressure only because something resists the flow – a load, a restriction or the relief valve.',
  },
  {
    id: 'cylinder-force',
    title: 'Cylinder force and bore size',
    objective: 'Relate load, bore, pressure (P = F/A) and speed (v = Q/A).',
    circuit: () => cylCircuit(),
    controls: [valveCmd, load, { kind: 'param', label: 'Cylinder bore', component: 'cyl', key: 'bore', min: 40, max: 100, step: 5, unit: 'mm', initial: 63 }],
    readouts: [
      { kind: 'pressure', label: 'Cap-end pressure', component: 'cyl', port: 'A' },
      { kind: 'readout', label: 'Rod velocity', component: 'cyl', key: 'velocity', quantity: 'velocity' },
      { kind: 'readout', label: 'Hydraulic force', component: 'cyl', key: 'force', quantity: 'force' },
      { kind: 'readout', label: 'Extension', component: 'cyl', key: 'extension', quantity: 'ratio' },
    ],
    steps: ['Extend with a 10 kN load and record pressure and velocity.', 'Increase bore to 80 mm and repeat.', 'Increase the load until the cylinder stalls at the relief setting.'],
    expected: ['Larger bore: lower pressure for the same load, but slower speed for the same flow.', 'Pressure follows the load, not the pump.', 'At the relief setting the cylinder stalls and pump flow goes over the relief.'],
    explanation: 'Force = pressure × area. Speed = flow ÷ area. Area trades speed for force. The pump does not decide pressure – the load does, up to the relief limit.',
  },
  {
    id: 'restricted-line',
    title: 'Restricted hydraulic line',
    objective: 'See the pressure drop and heat generated by a restriction, and how it affects the actuator.',
    circuit: () => cylCircuit(),
    controls: [valveCmd, { kind: 'fault', label: 'Pressure-line restriction (kink)', target: 'pressure', fault: 'hose-restricted' }, { kind: 'temperature', label: 'Fluid temperature', min: 0, max: 80 }],
    readouts: [
      { kind: 'pressure', label: 'Pump outlet', component: 'pump', port: 'OUT' },
      { kind: 'pressure', label: 'Valve inlet', component: 'dcv', port: 'P' },
      { kind: 'readout', label: 'Rod velocity', component: 'cyl', key: 'velocity', quantity: 'velocity' },
      { kind: 'temperature', label: 'Fluid temperature' },
    ],
    steps: ['Extend the cylinder with no restriction; note both pressures.', 'Add a 70 % restriction and extend again.', 'Cool the oil to 5 °C and repeat.'],
    expected: ['A pressure difference appears between pump outlet and valve inlet.', 'Velocity barely changes until the pump pressure reaches relief – then speed falls.', 'Cold, thick oil makes the drop much larger.'],
    explanation: 'Every restriction converts pressure into heat (power loss = Δp × Q). Measuring pressure at two points either side of a suspected restriction locates it.',
  },
  {
    id: 'relief-operation',
    title: 'Relief valve operation',
    objective: 'Observe cracking pressure, pressure override and flow division at the relief valve.',
    circuit: reliefCircuit,
    controls: [{ kind: 'input', label: 'Load valve opening', component: 'needle', key: 'opening', min: 0, max: 1, step: 0.01, quantity: 'ratio' }, { kind: 'input', label: 'Relief setting', component: 'relief', key: 'setting', min: 30 * BAR, max: 200 * BAR, step: BAR, quantity: 'pressure' }],
    readouts: [
      { kind: 'pressure', label: 'System pressure', component: 'pump', port: 'OUT' },
      { kind: 'flow', label: 'Flow to load', connection: 'line' },
      { kind: 'readout', label: 'Relief flow', component: 'relief', key: 'flow', quantity: 'flow' },
    ],
    steps: ['Close the load valve slowly from 100 % to 0 %.', 'Note when relief flow starts (cracking).', 'With the load fully closed, change the relief setting.'],
    expected: ['Below cracking pressure, all flow goes to the load.', 'Above it, flow divides; pressure rises a little more (override) as relief flow increases.', 'With the load blocked, system pressure equals the relief setting plus override, and all flow becomes heat.'],
    explanation: 'The relief valve sets maximum pressure. It is normally closed, and only opens when pressure overcomes its spring. A relief valve that passes flow all the time turns pump power into heat.',
  },
  {
    id: 'internal-leakage',
    title: 'Internal cylinder leakage',
    objective: 'See how a piston seal bypass causes drift and weak operation.',
    circuit: () => cylCircuit({ load: 15000 }),
    controls: [valveCmd, { kind: 'fault', label: 'Piston seal bypass', target: 'cyl', fault: 'cyl-seal-bypass' }, load],
    readouts: [
      { kind: 'readout', label: 'Extension', component: 'cyl', key: 'extension', quantity: 'ratio' },
      { kind: 'readout', label: 'Rod velocity', component: 'cyl', key: 'velocity', quantity: 'velocity' },
      { kind: 'pressure', label: 'Cap end', component: 'cyl', port: 'A' },
      { kind: 'pressure', label: 'Rod end', component: 'cyl', port: 'B' },
    ],
    steps: ['Extend halfway, return to neutral, and watch position.', 'Increase bypass to 60 % and repeat.', 'Compare cap and rod pressures in neutral.'],
    expected: ['Healthy cylinder holds position in neutral.', 'With bypass, the load drifts and the trapped pressures equalise.', 'Extension under load becomes slower.'],
    explanation: 'Fluid leaking across the piston lets the load move even when the valve blocks both ports. Distinguish from valve leakage by isolating the cylinder at its ports.',
  },
  {
    id: 'pump-wear',
    title: 'Pump wear',
    objective: 'Flow-test a pump: a worn pump delivers near-normal flow at low pressure but loses flow as pressure rises.',
    circuit: pumpTestCircuit,
    controls: [{ kind: 'input', label: 'Tester load valve closure', component: 'ft', key: 'load', min: 0, max: 0.97, step: 0.005, quantity: 'ratio' }, { kind: 'fault', label: 'Pump wear', target: 'pump', fault: 'pump-wear' }, { kind: 'temperature', label: 'Fluid temperature', min: 10, max: 80 }],
    readouts: [
      { kind: 'readout', label: 'Tester flow', component: 'ft', key: 'flow', quantity: 'flow' },
      { kind: 'readout', label: 'Tester pressure', component: 'ft', key: 'pressure', quantity: 'pressure' },
      { kind: 'temperature', label: 'Fluid temperature' },
    ],
    steps: ['Record flow at zero load.', 'Load to ≈ 70, 140 and 170 bar and record flow.', 'Repeat with 60 % wear, then at 70 °C.'],
    expected: ['Good pump: flow drops only a few percent with pressure.', 'Worn pump: flow drop grows steeply with pressure.', 'Hot (thin) oil increases the loss further.'],
    explanation: 'Pump slip (internal leakage) is proportional to pressure and inversely proportional to viscosity. Always test at working pressure and operating temperature; a no-load flow test can pass a badly worn pump.',
  },
  {
    id: 'flow-sharing',
    title: 'Multiple actuators and flow sharing',
    objective: 'Show that flow takes the path of least resistance when two functions operate together.',
    circuit: twoActuatorCircuit,
    controls: [
      { kind: 'input', label: 'Valve 1 (light load)', component: 'dcv1', key: 'command', min: -1, max: 1, step: 1, quantity: 'ratio' },
      { kind: 'input', label: 'Valve 2 (heavy load)', component: 'dcv2', key: 'command', min: -1, max: 1, step: 1, quantity: 'ratio' },
    ],
    readouts: [
      { kind: 'pressure', label: 'Pump pressure', component: 'pump', port: 'OUT' },
      { kind: 'readout', label: 'Cylinder 1 velocity', component: 'cyl1', key: 'velocity', quantity: 'velocity' },
      { kind: 'readout', label: 'Cylinder 2 velocity', component: 'cyl2', key: 'velocity', quantity: 'velocity' },
    ],
    steps: ['Operate valve 2 alone, then valve 1 alone.', 'Operate both together.'],
    expected: ['Together, the lightly loaded cylinder moves first and takes all the flow.', 'The heavy cylinder only moves when the light one reaches end of stroke and pressure rises.'],
    explanation: 'Pressure in a common supply is set by the lowest resistance. Pressure-compensated / load-sensing valves are used where simultaneous proportional functions are needed.',
  },
];

export const FUNDAMENTAL_LABS: Lab[] = [
  {
    id: 'manual-pump',
    title: 'Operate a manual hydraulic pump (Pascal’s principle)',
    objective: 'Generate pressure by hand and see a small input move a large load.',
    circuit: manualPumpCircuit,
    controls: [{ kind: 'input', label: 'Pump strokes per minute', component: 'pump', key: 'speed', min: 0, max: 60, step: 1, quantity: 'rpm' }, { kind: 'input', label: 'Release valve', component: 'release', key: 'opening', min: 0, max: 1, step: 0.01, quantity: 'ratio' }, { kind: 'input', label: 'Load on ram', component: 'cyl', key: 'externalForce', min: 0, max: 60000, step: 1000, quantity: 'force' }],
    readouts: [
      { kind: 'pressure', label: 'Ram pressure', component: 'cyl', port: 'A' },
      { kind: 'readout', label: 'Ram extension', component: 'cyl', key: 'extension', quantity: 'ratio' },
      { kind: 'readout', label: 'Ram force', component: 'cyl', key: 'force', quantity: 'force' },
    ],
    steps: ['Pump at 20 strokes/min and watch pressure rise until the ram lifts.', 'Stop pumping – the check valve holds the load.', 'Open the release valve slightly to lower the load.'],
    expected: ['Pressure rises until P × A equals the load (20 kN on a 50 mm ram ≈ 102 bar), then the ram moves.', 'With pumping stopped the load is held: oil is trapped by the check valve.'],
    explanation: 'Pascal: pressure applied to a confined fluid acts equally in all directions. A small hand-pump piston at high pressure lifts a large load on a larger area.',
    question: { q: 'Doubling the ram diameter (same load) changes the pressure needed to lift it to…', options: ['Half', 'A quarter', 'Double', 'Unchanged'], answer: 1, why: 'Area scales with diameter², so pressure = F/A falls to one quarter.' },
  },
  {
    id: 'generate-pressure',
    title: 'Generate pressure – and understand where it comes from',
    objective: 'Pressure is resistance to flow.',
    circuit: orificeCircuit,
    controls: EXPERIMENTS[0]!.controls,
    readouts: EXPERIMENTS[0]!.readouts,
    steps: EXPERIMENTS[0]!.steps,
    expected: EXPERIMENTS[0]!.expected,
    explanation: EXPERIMENTS[0]!.explanation,
    question: { q: 'A pump is running and the gauge reads near zero. The most likely reason is…', options: ['The pump is worn', 'Nothing is resisting the flow', 'The relief valve is set too high', 'The oil is too thick'], answer: 1, why: 'With an open path to tank there is no resistance, so no pressure – even with a perfect pump.' },
  },
  { ...EXPERIMENTS[2]!, id: 'restrict-line', title: 'Restrict a hydraulic line', question: { q: 'Where is heat generated in a restricted line?', options: ['At the pump', 'At the restriction', 'At the reservoir', 'Nowhere'], answer: 1, why: 'Power lost = Δp × Q is converted to heat where the pressure drop happens.' } },
  { ...EXPERIMENTS[1]!, id: 'cylinder-sizes', title: 'Change cylinder sizes', question: { q: 'Same flow, bigger bore. The cylinder…', options: ['Moves faster', 'Moves slower', 'Moves at the same speed', 'Stops'], answer: 1, why: 'v = Q/A: larger area, lower speed.' } },
  {
    id: 'pump-displacement',
    title: 'Change pump displacement',
    objective: 'Displacement and speed set flow – and therefore actuator speed – not pressure.',
    circuit: () => cylCircuit(),
    controls: [valveCmd, { kind: 'param', label: 'Pump displacement', component: 'pump', key: 'displacement', min: 6, max: 40, step: 1, unit: 'cm³/rev', initial: 16 }, pumpSpeed],
    readouts: [
      { kind: 'readout', label: 'Pump flow', component: 'pump', key: 'flow', quantity: 'flow' },
      { kind: 'readout', label: 'Rod velocity', component: 'cyl', key: 'velocity', quantity: 'velocity' },
      { kind: 'pressure', label: 'Cap-end pressure', component: 'cyl', port: 'A' },
    ],
    steps: ['Extend with 16 cm³/rev; note speed and pressure.', 'Change to 32 cm³/rev and repeat.'],
    expected: ['Doubling displacement doubles flow and speed.', 'Working pressure is unchanged – it is set by the load.'],
    explanation: 'Q = Vd × n. Bigger pumps move actuators faster; they do not make more force.',
    question: { q: 'To lift a heavier load you need more…', options: ['Displacement', 'Pressure (and area)', 'Pump speed', 'Reservoir volume'], answer: 1, why: 'Force = pressure × area.' },
  },
  {
    id: 'air',
    title: 'Introduce air into a circuit',
    objective: 'Air makes the fluid compressible: spongy, erratic movement and pump noise.',
    circuit: () => cylCircuit(),
    controls: [valveCmd, { kind: 'air', label: 'Entrained air', max: 0.12 }],
    readouts: [
      { kind: 'readout', label: 'Pump inlet fill', component: 'pump', key: 'fill', quantity: 'ratio' },
      { kind: 'readout', label: 'Rod velocity', component: 'cyl', key: 'velocity', quantity: 'velocity' },
      { kind: 'pressure', label: 'Pump pressure', component: 'pump', port: 'OUT' },
    ],
    steps: ['Extend with clean oil.', 'Add 6 % entrained air and extend again; watch the response at end of stroke.'],
    expected: ['Pressure builds more slowly (spongy).', 'Pump delivery falls as inlet fill drops.'],
    explanation: 'Air is compressible and reduces effective bulk modulus. Sources: low reservoir level, loose suction fittings, return lines above the oil level.',
  },
  {
    id: 'clogged-filter',
    title: 'Simulate a clogged filter',
    objective: 'See the filter Δp rise and the bypass open – unfiltered oil then circulates.',
    circuit: () => cylCircuit({ filter: true }),
    controls: [valveCmd, { kind: 'fault', label: 'Element loading', target: 'filter', fault: 'filter-clogged' }],
    readouts: [
      { kind: 'readout', label: 'Filter Δp', component: 'filter', key: 'dp', quantity: 'pressure' },
      { kind: 'readout', label: 'Bypass flow', component: 'filter', key: 'bypassFlow', quantity: 'flow' },
      { kind: 'pressure', label: 'Valve T port', component: 'dcv', port: 'T' },
    ],
    steps: ['Extend/retract with a clean filter.', 'Increase loading to 90 % and repeat; watch Δp and bypass.'],
    expected: ['Δp rises with loading until the 1.7 bar bypass opens.', 'Return back-pressure rises; bypass flow is unfiltered.'],
    explanation: 'A bypassing filter protects itself, not the system. The restriction indicator tells you to change the element.',
  },
];


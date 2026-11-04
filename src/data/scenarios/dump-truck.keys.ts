
import type { ScenarioKey } from '@/simulation/scenarios/types';

/**
 * HIDDEN scenario keys. Only the diagnostic engine imports this module; the
 * UI must never render it before the technician submits their diagnosis.
 */
const E = {
  operate: { label: 'Operated the hoist to reproduce the complaint', anyOf: ['op:raise'] },
  tp1: { label: 'Measured pump/system pressure at TP1', anyOf: ['gauge:TP1'] },
  tp2: { label: 'Measured pressure at the cylinder (TP2)', anyOf: ['gauge:TP2'] },
  tp3: { label: 'Measured pump inlet vacuum at TP3', anyOf: ['gauge:TP3'] },
  flow: { label: 'Performed a pump flow test with the in-line tester', anyOf: ['flow-test'] },
  ptoV: { label: 'Checked voltage at the PTO solenoid', anyOf: ['meter:pto-sol:voltage'] },
  ptoR: { label: 'Checked PTO solenoid coil resistance', anyOf: ['meter:pto-sol:resistance'] },
  tach: { label: 'Verified PTO / pump shaft speed with a tachometer', anyOf: ['tach:pump', 'tach:pto'] },
  sample: { label: 'Took a fluid sample', anyOf: ['fluid-sample'] },
  level: { label: 'Checked reservoir level', anyOf: ['sight-glass', 'inspect:ip-reservoir'] },
  drift: { label: 'Performed a drift test', anyOf: ['drift-test'] },
  leakInspect: { label: 'Inspected lines for leaks', anyOf: ['inspect:ip-pressure-hose', 'inspect:ip-cyl-hose', 'inspect:ip-return-lines', 'inspect:ip-pump-outlet'] },
  cylInspect: { label: 'Inspected the hoist cylinder', anyOf: ['inspect:ip-cylinder'] },
  valveInspect: { label: 'Inspected the hoist valve', anyOf: ['inspect:ip-valve', 'inspect:ip-valve-wiring'] },
  routing: { label: 'Verified hose routing against port markings', anyOf: ['inspect:ip-valve', 'inspect:ip-pump-outlet', 'inspect:ip-return-lines'] },
  ir: { label: 'Measured component temperature', anyOf: ['ir:'] },
  reliefBench: { label: 'Bench-tested or measured the relief valve', anyOf: ['gauge:TP1', 'bench:relief'] },
  temp: { label: 'Tested at operating temperature', anyOf: ['flow-test'] },
};

export const DUMP_TRUCK_KEYS: ScenarioKey[] = [
  {
    scenarioId: 'dt-normal',
    faults: [],
    evidence: [E.operate, E.tp1, E.flow, E.level],
    explanation: 'No fault. Baseline: ≈107 L/min at 1550 pump rpm, relief ≈178–185 bar at TP1 at end of stroke, loaded raise ≈21 s, three pressure steps as each telescopic stage extends.',
  },
  {
    scenarioId: 'dt-pto-no-engage',
    faults: [{ id: 'f1', kind: 'pto-solenoid-open', target: 'pto-sol', severity: 1 }],
    evidence: [E.operate, E.ptoV, E.ptoR],
    explanation: 'The PTO shift solenoid coil is open circuit. Battery voltage is present at connector C-PTO with the switch ON (proving the switch, fuse and wiring), but the coil reads OL. Replace the solenoid, then verify engagement.',
  },
  {
    scenarioId: 'dt-pump-low-flow',
    faults: [{ id: 'f1', kind: 'pump-wear', target: 'pump', severity: 0.2 }],
    evidence: [E.operate, E.flow, E.tp1],
    explanation: 'Worn gear pump. Internal slip grows with pressure and falls with viscosity, so flow collapses when hot and loaded. A flow test shows near-normal flow at low pressure but a large drop as the tester load valve raises pressure. Replace the pump with a part of matching rotation, displacement and mounting.',
  },
  {
    scenarioId: 'dt-pump-low-pressure',
    faults: [{ id: 'f1', kind: 'pump-gear-damage', target: 'pump', severity: 0.75 }],
    evidence: [E.operate, E.flow, E.sample],
    explanation: 'Damaged pump gears (likely from the earlier low-oil incident causing cavitation). Leakage is so high that the pump cannot generate the pressure needed for the third stage with a full load. The fluid sample contains metallic wear debris – flush the system and replace the filter along with the pump.',
  },
  {
    scenarioId: 'dt-relief-stuck-open',
    faults: [{ id: 'f1', kind: 'relief-stuck-open', target: 'relief', severity: 0.25 }],
    evidence: [E.operate, E.tp1, E.ir],
    explanation: 'Relief valve held partially open by debris. Pump flow bypasses to tank as pressure rises, so the system can never exceed ≈40 bar. TP1 shows the same low pressure as TP2 (no restriction between them), the relief body and return line run hot. A flow test at no load would show normal pump flow – the pump is fine.',
  },
  {
    scenarioId: 'dt-relief-stuck-closed',
    faults: [{ id: 'f1', kind: 'relief-stuck-closed', target: 'relief', severity: 1 }],
    evidence: [E.reliefBench, E.operate],
    explanation: 'Relief valve seized closed. At end of stroke the pump dead-heads: pressure climbs past the hose rating until a hose bursts or the PTO is overloaded. Replace the relief valve and set it to specification before returning to service.',
  },
  {
    scenarioId: 'dt-restricted-suction',
    faults: [{ id: 'f1', kind: 'suction-collapsed', target: 'suction', severity: 0.55 }],
    evidence: [E.operate, E.tp3],
    explanation: 'The suction hose has collapsed where it was rerouted. Inlet vacuum at TP3 is excessive (well below −0.2 bar) especially with cold, thick oil and high pump speed, so the pump cavitates. Replace the suction hose with correct reinforced suction hose and route it without kinks.',
  },
  {
    scenarioId: 'dt-external-leak',
    faults: [{ id: 'f1', kind: 'hose-pinhole', target: 'work', severity: 0.9 }],
    evidence: [E.operate, E.leakInspect],
    explanation: 'Pin-hole in the hoist cylinder hose. Fluid only escapes while the line is pressurised (raising/holding). Locate with cardboard, never by hand – a pin-hole jet can inject fluid through skin. Replace the hose assembly.',
  },
  {
    scenarioId: 'dt-cylinder-bypass',
    faults: [{ id: 'f1', kind: 'cyl-seal-bypass', target: 'cyl', severity: 0.45 }],
    evidence: [E.drift, E.cylInspect],
    explanation: 'Worn piston/stage seals in the telescopic cylinder. In HOLD the valve isolates the cylinder, yet the body settles and oil appears at the cylinder breather – the leakage path is inside the cylinder, not the valve.',
  },
  {
    scenarioId: 'dt-dcv-sticking',
    faults: [{ id: 'f1', kind: 'spool-stuck', target: 'dcv', severity: 1, activation: { type: 'intermittent', meanOn: 25, meanOff: 45 } }],
    setup: { fluid: { contamination: 22 } },
    evidence: [E.operate, E.valveInspect, E.sample],
    explanation: 'Hoist valve spool sticking intermittently due to heavily contaminated fluid (ISO ≈24/22/19). The solenoid clicks but the spool does not shift. Free/replace the valve, then flush the fluid and replace the filter – otherwise it will recur.',
  },
  {
    scenarioId: 'dt-wrong-connections',
    faults: [],
    setup: {
      reconnect: [
        { connection: 'pressure', to: { component: 'dcv', port: 'T' } },
        { connection: 'return', from: { component: 'dcv', port: 'P' } },
      ],
    },
    evidence: [E.routing],
    explanation: 'Pump pressure hose is on the valve T port and the return hose on P. The relief is now on the return side, so RAISE dead-heads the pump with NO overpressure protection, and LOWER routes pump flow into the cylinder. Swap the hoses to match the port markings and schematic before operating.',
  },
  {
    scenarioId: 'dt-relief-misadjusted',
    faults: [{ id: 'f1', kind: 'relief-misadjusted', target: 'relief', severity: 1 }],
    evidence: [E.operate, E.tp1],
    explanation: 'Relief valve backed off to ≈77 bar cracking (≈86 bar at full flow). Enough for the empty body and the first stages, not for stage 3 with a full load. Measure at TP1 at end of stroke, adjust to the specified setting, and re-test.',
  },
  {
    scenarioId: 'dt-low-fluid',
    faults: [],
    setup: { reservoirVolumeL: 48 },
    evidence: [E.level, E.operate],
    explanation: 'Reservoir under-filled. Extending the cylinder draws ≈35 L from the tank; near full height the suction pickup uncovers and the pump draws air. Check the level with the body DOWN, top up with the specified fluid and investigate where it went.',
  },
  {
    scenarioId: 'dt-hot-pump',
    faults: [{ id: 'f1', kind: 'pump-wear', target: 'pump', severity: 0.85, activation: { type: 'temperature', above: 55, ramp: 10 } }],
    evidence: [E.operate, E.temp],
    explanation: 'Pump wear whose effect only becomes severe at high temperature (low viscosity). A cold flow test passes; the test must be repeated at operating temperature (>55 °C) to reveal the loss.',
  },
  {
    scenarioId: 'dt-pto-coupling',
    faults: [{ id: 'f1', kind: 'pto-coupling-failure', target: 'pto', severity: 1 }],
    evidence: [E.tach, E.tp1],
    explanation: 'Stripped spline coupling between the PTO output and the pump. The PTO engages (lamp on) and its output turns, but the pump shaft does not. Zero pressure at TP1 and 0 rpm pump shaft speed confirm it.',
  },
  {
    scenarioId: 'dt-pto-slip',
    faults: [{ id: 'f1', kind: 'pto-slip', target: 'pto', severity: 0.7 }],
    evidence: [E.tach, E.operate],
    explanation: 'PTO clutch slipping under torque. Pump speed falls well below engine rpm × PTO ratio as pressure rises. Repair the PTO.',
  },
  {
    scenarioId: 'dt-multi-pump-suction',
    faults: [
      { id: 'f1', kind: 'pump-wear', target: 'pump', severity: 0.5, progressionPerHour: 0.2 },
      { id: 'f2', kind: 'suction-collapsed', target: 'suction', severity: 0.6 },
    ],
    evidence: [E.tp3, E.flow, E.operate],
    explanation: 'Two faults: a restricted suction hose causing cavitation (high TP3 vacuum) AND a worn pump (flow drops with pressure on the flow tester). The cavitation is accelerating the pump wear. Both must be repaired; replacing only the pump leaves a cause of failure in place.',
  },
  {
    scenarioId: 'dt-multi-relief-cylinder',
    faults: [
      { id: 'f1', kind: 'relief-misadjusted', target: 'relief', severity: 0.95 },
      { id: 'f2', kind: 'cyl-seal-bypass', target: 'cyl', severity: 0.4 },
    ],
    evidence: [E.tp1, E.drift, E.cylInspect],
    explanation: 'Relief set low (weak lift) and cylinder seal bypass (drift, oil at breather). Raising the relief setting alone would not fix the drift; replacing the cylinder alone would not fix the lift.',
  },
  {
    scenarioId: 'dt-multi-intermittent',
    faults: [
      { id: 'f1', kind: 'pto-no-engage', target: 'pto', severity: 1, activation: { type: 'intermittent', meanOn: 15, meanOff: 50 } },
      { id: 'f2', kind: 'wiring-high-resistance', target: 'raise-sol', severity: 0.75 },
    ],
    evidence: [E.ptoV, { label: 'Measured voltage at the RAISE solenoid', anyOf: ['meter:raise-sol:voltage'] }, E.operate],
    explanation: 'Intermittent PTO shift mechanism failure plus a corroded RAISE solenoid connector. Under load the corroded connector drops the solenoid voltage below its pull-in voltage. Voltage measured at the connector while energised is the key test.',
  },
  {
    scenarioId: 'dt-multi-filter-valve',
    faults: [
      { id: 'f1', kind: 'filter-clogged', target: 'filter', severity: 1 },
      { id: 'f2', kind: 'dcv-internal-leak', target: 'dcv', severity: 0.5 },
    ],
    evidence: [E.drift, E.valveInspect, { label: 'Checked filter indicator / Δp at TP4', anyOf: ['gauge:TP4', 'inspect:ip-filter'] }],
    explanation: 'Clogged return filter (bypassing – unfiltered oil circulating) and hoist valve spool leakage (drift in HOLD with no oil at the cylinder breather). Replace the element and the valve.',
  },
];


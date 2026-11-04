import type { ScenarioKey } from '@/simulation/scenarios/types';

/** HIDDEN keys for the service-crane scenarios (loaded only by the diagnostic engine). */
const E = {
  operate: { label: 'Operated the crane to reproduce the complaint', anyOf: ['op:lift', 'op:winch', 'op:extend'] },
  tp1: { label: 'Measured pump/system pressure at TP1', anyOf: ['gauge:TP1'] },
  tp2: { label: 'Measured lift cylinder load-side pressure at TP2', anyOf: ['gauge:TP2'] },
  tp3: { label: 'Measured winch motor pressure at TP3', anyOf: ['gauge:TP3'] },
  flow: { label: 'Pump flow test', anyOf: ['flow-test'] },
  drift: { label: 'Performed a drift / hold test', anyOf: ['drift-test'] },
  lift: { label: 'Inspected the lift cylinder and counterbalance', anyOf: ['inspect:ip-lift'] },
  stab: { label: 'Inspected the stabilizer and lock valve', anyOf: ['inspect:ip-stabilizer'] },
  winch: { label: 'Inspected the winch', anyOf: ['inspect:ip-winch'] },
};

export const SERVICE_CRANE_KEYS: ScenarioKey[] = [
  { scenarioId: 'sc-normal', faults: [], evidence: [E.operate, E.tp1, E.drift], explanation: 'No fault. Baseline: ≈14 bar circulating in neutral, ≈32 L/min at 1200 engine rpm, relief ≈195 bar at TP1, lift pressure ≈67 bar with 1000 kg at 3.3 m rising to ≈100 bar at full reach (load moment ≈96 %).' },
  { scenarioId: 'sc-boom-drift', faults: [{ id: 'f1', kind: 'load-valve-leak', target: 'cb-lift', severity: 0.6 }], evidence: [E.drift, E.tp2, E.lift], explanation: 'Leaking boom-lift counterbalance valve. With the valve bank work ports open to tank in neutral, any leakage past the counterbalance seat lets the boom settle; the cylinder seals are fine (no rod-side pressure build-up, no external leak). Replace the counterbalance cartridge and set it to specification.' },
  { scenarioId: 'sc-winch-weak', faults: [{ id: 'f1', kind: 'pump-wear', target: 'mot-winch', severity: 0.9 }], evidence: [E.operate, E.tp3, E.flow], explanation: 'Worn winch motor. Pump flow is normal (flow test) and the motor sees normal pressure at TP3, yet line speed is low – internal slip across the motor, worse when hot. Replace the winch motor.' },
  { scenarioId: 'sc-relief-low', faults: [{ id: 'f1', kind: 'relief-misadjusted', target: 'relief', severity: 0.92 }], evidence: [E.tp1, E.operate], explanation: 'Main relief backed off to ≈94 bar. The lift stalls at full reach without any load-moment alarm – the pressure, not the moment, is the limit. Adjust the relief to specification and re-test.' },
  { scenarioId: 'sc-stabilizer-creep', faults: [{ id: 'f1', kind: 'load-valve-leak', target: 'pc-out', severity: 0.8 }], evidence: [E.stab, E.drift], explanation: 'Leaking stabilizer lock valve. Under the truck’s weight the leg slowly retracts; when it no longer carries its share the load-moment system halves capacity and cuts out the lift. Replace the pilot-operated check valve.' },
  { scenarioId: 'sc-pump-hot', faults: [{ id: 'f1', kind: 'pump-wear', target: 'pump', severity: 0.85, activation: { type: 'temperature', above: 55, ramp: 10 } }], evidence: [E.flow, E.operate], explanation: 'Pump wear that only becomes severe when hot. A loaded flow test at operating temperature shows the loss.' },
  {
    scenarioId: 'sc-multi',
    faults: [
      { id: 'f1', kind: 'load-valve-leak', target: 'cb-lift', severity: 0.6 },
      { id: 'f2', kind: 'pump-wear', target: 'mot-winch', severity: 0.85 },
    ],
    evidence: [E.drift, E.tp3, E.lift, E.winch],
    explanation: 'Two independent faults: a leaking boom-lift counterbalance (the seals the other shop replaced were never the cause) and a worn winch motor.',
  },
];

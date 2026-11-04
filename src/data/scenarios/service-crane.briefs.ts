import { BAR } from '@/simulation/core/units';
import type { ScenarioBrief, VerificationCriterion } from '@/simulation/scenarios/types';
import { SERVICE_CRANE_ID } from '@/equipment/service-crane/definition';

/** Verification limits are SIMULATED TRAINING VALUES for the generic service crane. */
export const CRANE_VERIFICATION: VerificationCriterion[] = [
  { type: 'pto-drive', label: 'PTO engages and pump delivers flow' },
  { type: 'all-functions', label: 'Every crane function operates in both directions' },
  { type: 'lift-load', label: 'Lifts a 1000 kg test load clear of the ground with the stabilizer set', minKg: 1000 },
  { type: 'relief-pressure', label: 'Main relief pressure at TP1 within training spec', min: 185 * BAR, max: 205 * BAR },
  { type: 'actuator-holds', label: 'Boom holds a suspended load in neutral', component: 'cyl-lift', maxRatePerMin: 10, requireSuspendedLoad: true },
  { type: 'actuator-holds', label: 'Stabilizer holds the truck', component: 'cyl-out', maxRatePerMin: 5 },
  { type: 'no-leaks', label: 'No external leakage under pressure', seconds: 40 },
];

const base = {
  equipmentId: SERVICE_CRANE_ID,
  conditions: { payload: 0, hookLoad: 1000, ambient: 20, initialTemperature: 25 },
  verification: CRANE_VERIFICATION,
};

export const SERVICE_CRANE_BRIEFS: ScenarioBrief[] = [
  {
    ...base,
    id: 'sc-normal',
    title: 'Crane pre-use inspection and function test',
    mode: 'guided',
    difficulty: 1,
    customer: 'Fleet safety officer',
    complaint: 'Annual inspection is due. Verify every crane function, the stabilizer, the load-moment limiter and record baseline pressures.',
    history: ['A 1000 kg test weight is on the ground under the hook.'],
    learningObjectives: ['Set the stabilizer before lifting', 'Operate every function and observe counterbalance behaviour', 'See the load-moment limiter cut out motions that increase the moment'],
    hints: ['Engage the PTO at idle, then lower the stabilizer until the leg carries the truck.', 'Rig the load only when the hook is on the ground.', 'Extend the boom with the load raised and watch the load moment approach 100 %.'],
  },
  {
    ...base,
    id: 'sc-boom-drift',
    title: 'Boom settles while holding a load',
    mode: 'practical',
    difficulty: 3,
    customer: 'Field mechanic',
    complaint: 'When I hold a load still, the boom slowly comes down. Empty it seems fine.',
    history: ['Crane is 6 years old.', 'No recent repairs.'],
    learningObjectives: ['Locate the leakage path that lets a load-holding circuit drift', 'Distinguish counterbalance leakage from cylinder seal bypass'],
  },
  {
    ...base,
    id: 'sc-winch-weak',
    title: 'Winch slow and struggles with heavier loads',
    mode: 'practical',
    difficulty: 3,
    customer: 'Field mechanic',
    complaint: 'The winch is slow picking up our usual loads and gets worse when it’s been working a while.',
    history: [],
    conditions: { payload: 0, hookLoad: 1000, ambient: 30, initialTemperature: 50 },
    learningObjectives: ['Compare winch pressure and speed with pump flow', 'Recognise hydraulic motor wear'],
  },
  {
    ...base,
    id: 'sc-relief-low',
    title: 'Crane weak at full reach – no alarm',
    mode: 'practical',
    difficulty: 3,
    customer: 'Operator',
    complaint: 'It used to lift this load at full reach. Now the boom stops going up and just hums – but the load moment light isn’t on.',
    history: ['A shop “stopped a squeal” on the valve bank last month.'],
    learningObjectives: ['Distinguish a relief-valve limit from a load-moment cut-out', 'Measure and adjust the main relief against its specification'],
  },
  {
    ...base,
    id: 'sc-stabilizer-creep',
    title: 'Load-moment alarm trips mid-lift',
    mode: 'challenge',
    difficulty: 4,
    customer: 'Operator',
    complaint: 'Halfway through a lift the load-moment alarm goes off and everything stops – with a load I lift every day. The truck feels like it’s settling.',
    history: [],
    learningObjectives: ['Connect a stabilizer lock-valve leak to the load-moment system’s capacity reduction', 'Perform a stabilizer hold test'],
  },
  {
    ...base,
    id: 'sc-pump-hot',
    title: 'All crane functions slow when hot',
    mode: 'challenge',
    difficulty: 4,
    customer: 'Operator',
    complaint: 'Morning is fine. After a long job everything gets slow.',
    history: [],
    conditions: { payload: 0, hookLoad: 1000, ambient: 35, initialTemperature: 50 },
    learningObjectives: ['Test the pump at operating temperature and pressure'],
  },
  {
    ...base,
    id: 'sc-multi',
    title: 'Master: drifting boom and a tired winch',
    mode: 'master',
    difficulty: 5,
    customer: 'Service manager',
    complaint: 'Two complaints from the same truck: the boom drifts with a load and the winch can barely pick up a tonne.',
    history: ['Another shop replaced the boom lift cylinder seals – the drift came back.'],
    conditions: { payload: 0, hookLoad: 1000, ambient: 25, initialTemperature: 45 },
    learningObjectives: ['Identify both faults and prove each repair'],
  },
];

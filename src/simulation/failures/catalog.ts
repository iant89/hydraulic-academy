/**
 * Failure library. Each fault kind describes a physical defect; component
 * models read its effective severity and change their behaviour. Symptoms
 * are NOT scripted – they emerge from the simulation.
 */
export type RepairAction =
  | 'replace-component'
  | 'replace-hose'
  | 'tighten-fitting'
  | 'adjust-setting'
  | 'replace-filter'
  | 'top-up-fluid'
  | 'drain-flush-fluid'
  | 'repair-wiring'
  | 'replace-solenoid'
  | 'reconnect-lines'
  | 'bleed-air'
  | 'clean-cooler'
  | 'repair-pto'
  | 'free-spool';

export type FaultTargetKind = 'component' | 'connection' | 'pto' | 'electrical' | 'fluid' | 'reservoir';

export interface FaultKindInfo {
  kind: string;
  label: string;
  group: 'Pump' | 'Valve' | 'Cylinder' | 'Hose & fitting' | 'PTO' | 'Electrical' | 'System';
  target: FaultTargetKind;
  appliesTo?: string[];
  description: string;
  typicalSymptoms: string[];
  repairs: RepairAction[];
}

export const FAULT_KINDS: FaultKindInfo[] = [
  { kind: 'pump-wear', label: 'Worn pump (internal leakage)', group: 'Pump', target: 'component', appliesTo: ['pump-gear', 'pump-vane', 'pump-piston-pc', 'motor'], description: 'Worn gear side-plates / housing increase internal slip from outlet back to inlet. Slip grows with pressure and with thinner (hotter) oil.', typicalSymptoms: ['Slow actuator speed, worse under load', 'Worse when oil is hot', 'Pump flow drops sharply as tester load is increased', 'Pump runs hot'], repairs: ['replace-component'] },
  { kind: 'pump-gear-damage', label: 'Damaged pump gears', group: 'Pump', target: 'component', appliesTo: ['pump-gear'], description: 'Chipped or scored gear teeth – high leakage, noise and contamination generation.', typicalSymptoms: ['Rattling/grinding noise from pump', 'Low flow', 'Metallic particles in fluid sample'], repairs: ['replace-component'] },
  { kind: 'pump-shaft-sheared', label: 'Sheared pump shaft / coupling', group: 'Pump', target: 'component', appliesTo: ['pump-gear', 'pump-vane', 'pump-piston-pc'], description: 'Drive is turning but the pump rotating group is not.', typicalSymptoms: ['No hydraulic function at all', 'No pressure at pump outlet', 'PTO indicates engaged; pump shaft not turning'], repairs: ['replace-component'] },
  { kind: 'relief-stuck-open', label: 'Relief valve stuck open', group: 'Valve', target: 'component', appliesTo: ['relief-valve', 'unloading-valve'], description: 'Poppet held off its seat by debris or a broken spring: pump flow bypasses to tank at low pressure.', typicalSymptoms: ['Low system pressure', 'Actuator weak or will not lift load', 'Excess heat in return line', 'Normal pump flow at zero load'], repairs: ['replace-component'] },
  { kind: 'relief-stuck-closed', label: 'Relief valve stuck closed', group: 'Valve', target: 'component', appliesTo: ['relief-valve'], description: 'Poppet seized: no overpressure protection. Pressure rises uncontrolled at end of stroke.', typicalSymptoms: ['Extreme pressure at end of stroke', 'Engine lugs / PTO overloads', 'Hose or seal failure'], repairs: ['replace-component'] },
  { kind: 'relief-seat-leak', label: 'Relief valve seat leakage', group: 'Valve', target: 'component', appliesTo: ['relief-valve'], description: 'Worn or eroded seat leaks below the setting.', typicalSymptoms: ['Slightly reduced speed at high pressure', 'Warm relief valve body'], repairs: ['replace-component'] },
  { kind: 'relief-misadjusted', label: 'Incorrect relief setting', group: 'Valve', target: 'component', appliesTo: ['relief-valve'], description: 'Adjuster backed off (or tampered) – valve relieves below the specified pressure.', typicalSymptoms: ['Will not lift full load', 'Lifts empty body normally', 'Pressure stalls at a consistent value below spec'], repairs: ['adjust-setting'] },
  { kind: 'spool-stuck', label: 'Directional spool sticking', group: 'Valve', target: 'component', appliesTo: ['dcv', 'priority-valve'], description: 'Spool binds in its bore (contamination, varnish, distortion from over-torqued mounting).', typicalSymptoms: ['Function does not respond to the control', 'Responds intermittently', 'Worse with contaminated or hot fluid'], repairs: ['free-spool', 'replace-component'] },
  { kind: 'dcv-internal-leak', label: 'Valve spool internal leakage', group: 'Valve', target: 'component', appliesTo: ['dcv'], description: 'Worn spool/bore clearance lets the work port leak to tank in neutral.', typicalSymptoms: ['Load drifts down in neutral', 'Drift increases when hot', 'No external leak visible'], repairs: ['replace-component'] },
  { kind: 'dcv-restricted', label: 'Restricted valve passage', group: 'Valve', target: 'component', appliesTo: ['dcv', 'flow-control', 'pressure-reducing', 'cooler'], description: 'Debris or a collapsed internal passage chokes flow.', typicalSymptoms: ['Slow function with high pressure upstream', 'Heat at the restriction'], repairs: ['replace-component'] },
  { kind: 'check-leak', label: 'Leaking check valve', group: 'Valve', target: 'component', appliesTo: ['check-valve'], description: 'Damaged seat allows reverse flow.', typicalSymptoms: ['Load drift', 'Pump turns backwards at shutdown'], repairs: ['replace-component'] },
  { kind: 'load-valve-leak', label: 'Leaking load-holding valve', group: 'Valve', target: 'component', appliesTo: ['pilot-check', 'counterbalance'], description: 'Load-holding valve seat leaks.', typicalSymptoms: ['Load creeps down in neutral'], repairs: ['replace-component'] },
  { kind: 'cyl-seal-bypass', label: 'Cylinder piston seal bypass', group: 'Cylinder', target: 'component', appliesTo: ['cylinder'], description: 'Piston seal worn/rolled: fluid passes across the piston. On single-acting hoists it discharges at the breather.', typicalSymptoms: ['Load drifts down in hold', 'Oil mist at breather (single-acting)', 'Slow/weak lift under load', 'Pressure falls slowly with valve in neutral'], repairs: ['replace-component'] },
  { kind: 'cyl-rod-seal-leak', label: 'Cylinder rod/gland seal leak', group: 'Cylinder', target: 'component', appliesTo: ['cylinder'], description: 'External leak at the gland.', typicalSymptoms: ['Oil on rod / below cylinder', 'Low reservoir level over time'], repairs: ['replace-component'] },
  { kind: 'cyl-binding', label: 'Mechanical binding', group: 'Cylinder', target: 'component', appliesTo: ['cylinder', 'motor'], description: 'Misaligned mounts, dry pivot pins or a damaged barrel add mechanical resistance.', typicalSymptoms: ['Jerky movement', 'Higher than normal pressure to move', 'Body raises unevenly'], repairs: ['replace-component'] },
  { kind: 'cyl-bent-rod', label: 'Bent cylinder rod', group: 'Cylinder', target: 'component', appliesTo: ['cylinder'], description: 'Rod bent by side loading – binding and gland seal damage.', typicalSymptoms: ['Visible rod run-out', 'Gland leakage', 'Binding'], repairs: ['replace-component'] },
  { kind: 'filter-clogged', label: 'Clogged filter element', group: 'System', target: 'component', appliesTo: ['filter'], description: 'Loaded element raises Δp until the bypass valve opens.', typicalSymptoms: ['Filter indicator in red', 'Unfiltered oil circulates', 'Return back-pressure'], repairs: ['replace-filter'] },
  { kind: 'cooler-blocked', label: 'Cooler fins blocked', group: 'System', target: 'component', appliesTo: ['cooler'], description: 'Debris on the core reduces heat rejection.', typicalSymptoms: ['Overheating during long cycles', 'Normal function when cold'], repairs: ['clean-cooler'] },
  { kind: 'reservoir-breather-blocked', label: 'Blocked reservoir breather', group: 'System', target: 'component', appliesTo: ['reservoir'], description: 'Tank cannot breathe as fluid volume changes – vacuum forms when cylinders extend.', typicalSymptoms: ['Pump noise late in the lift', 'Tank panels drawn in'], repairs: ['replace-component'] },
  { kind: 'accumulator-precharge-loss', label: 'Accumulator precharge lost', group: 'System', target: 'component', appliesTo: ['accumulator'], description: 'Nitrogen has leaked away.', typicalSymptoms: ['Rapid pressure cycling', 'Little stored volume'], repairs: ['replace-component'] },
  { kind: 'hose-pinhole', label: 'Pin-hole hose leak', group: 'Hose & fitting', target: 'connection', description: 'A pin-hole in the hose cover emits a fine high-velocity jet – INJECTION HAZARD. Locate with cardboard, never by hand.', typicalSymptoms: ['Fine mist/wetness near hose', 'Fluid loss', 'Slight pressure loss'], repairs: ['replace-hose'] },
  { kind: 'hose-rupture', label: 'Hose rupture', group: 'Hose & fitting', target: 'connection', description: 'Burst hose – major fluid loss and whipping hazard.', typicalSymptoms: ['Large external leak', 'Loss of function', 'Pressure collapse'], repairs: ['replace-hose'] },
  { kind: 'fitting-loose', label: 'Loose fitting', group: 'Hose & fitting', target: 'connection', description: 'Under-torqued or damaged O-ring face seal.', typicalSymptoms: ['Weeping at a fitting', 'Worse under pressure'], repairs: ['tighten-fitting'] },
  { kind: 'hose-restricted', label: 'Restricted / kinked hose', group: 'Hose & fitting', target: 'connection', description: 'Kinked hose or delaminated inner tube.', typicalSymptoms: ['Slow function', 'Pressure drop along the line', 'Heat at the restriction'], repairs: ['replace-hose'] },
  { kind: 'suction-collapsed', label: 'Collapsed suction hose', group: 'Hose & fitting', target: 'connection', description: 'Suction hose wall collapses under vacuum – starves the pump.', typicalSymptoms: ['Pump whine (cavitation)', 'Low inlet pressure (vacuum)', 'Slow, erratic function', 'Worse at high RPM and with cold oil'], repairs: ['replace-hose'] },
  { kind: 'suction-air-leak', label: 'Air leak at suction fitting', group: 'Hose & fitting', target: 'connection', description: 'Loose suction clamp draws air into the pump inlet.', typicalSymptoms: ['Foamy fluid in reservoir', 'Erratic, spongy operation', 'Pump noise (growling)'], repairs: ['tighten-fitting'] },
  { kind: 'pto-no-engage', label: 'PTO shift mechanism failure', group: 'PTO', target: 'pto', description: 'Shift fork / air or electric shift cylinder does not move the PTO into gear.', typicalSymptoms: ['PTO indicator off', 'Pump does not turn', 'Shift solenoid energised (voltage present)'], repairs: ['repair-pto'] },
  { kind: 'pto-slip', label: 'PTO clutch slipping', group: 'PTO', target: 'pto', description: 'Worn PTO clutch slips when torque demand rises.', typicalSymptoms: ['Pump speed falls under load', 'Lift slows near end of stroke', 'Burning smell'], repairs: ['repair-pto'] },
  { kind: 'pto-gear-damage', label: 'Damaged PTO drive gear', group: 'PTO', target: 'pto', description: 'Worn/chipped gear teeth – noise and intermittent drive.', typicalSymptoms: ['Grinding noise when engaged', 'Intermittent loss of drive under load'], repairs: ['repair-pto'] },
  { kind: 'pto-coupling-failure', label: 'PTO-to-pump coupling failure', group: 'PTO', target: 'pto', description: 'Spline or coupler stripped between PTO output and pump.', typicalSymptoms: ['PTO indicator on', 'Pump shaft not turning', 'No pressure or flow'], repairs: ['repair-pto'] },
  { kind: 'pto-solenoid-open', label: 'PTO shift solenoid coil open', group: 'Electrical', target: 'electrical', description: 'Coil winding open circuit.', typicalSymptoms: ['PTO will not engage', 'Supply voltage present at connector', 'Coil resistance reads OL'], repairs: ['replace-solenoid'] },
  { kind: 'dcv-solenoid-open', label: 'Valve solenoid coil open', group: 'Electrical', target: 'electrical', description: 'Directional valve solenoid winding open – spool does not shift.', typicalSymptoms: ['One function inoperative', 'Voltage present, resistance OL'], repairs: ['replace-solenoid'] },
  { kind: 'wiring-open', label: 'Open circuit in wiring', group: 'Electrical', target: 'electrical', description: 'Broken wire/connector pin.', typicalSymptoms: ['0 V at device connector'], repairs: ['repair-wiring'] },
  { kind: 'wiring-high-resistance', label: 'Corroded connector (high resistance)', group: 'Electrical', target: 'electrical', description: 'Corrosion drops voltage under current.', typicalSymptoms: ['Low voltage at device under load', 'Intermittent operation'], repairs: ['repair-wiring'] },
  { kind: 'fluid-contaminated', label: 'Contaminated fluid', group: 'System', target: 'fluid', description: 'High particle count – accelerates wear and causes spool sticking.', typicalSymptoms: ['Dark/cloudy sample', 'High ISO code', 'Sticking valves'], repairs: ['drain-flush-fluid', 'replace-filter'] },
  { kind: 'fluid-incorrect', label: 'Incorrect fluid', group: 'System', target: 'fluid', description: 'Wrong viscosity grade (e.g. engine oil) in the hydraulic system.', typicalSymptoms: ['Sluggish when cold', 'Cavitation at start-up', 'Sample does not match specification'], repairs: ['drain-flush-fluid'] },
  { kind: 'fluid-water', label: 'Water in fluid', group: 'System', target: 'fluid', description: 'Condensation / ingress – milky fluid.', typicalSymptoms: ['Milky sample', 'Corrosion'], repairs: ['drain-flush-fluid'] },
  { kind: 'low-fluid', label: 'Low hydraulic fluid', group: 'System', target: 'reservoir', description: 'Insufficient fluid – pickup uncovers as cylinders extend.', typicalSymptoms: ['Level below MIN in sight glass', 'Pump noise late in lift', 'Lift stops short / jerky'], repairs: ['top-up-fluid'] },
  { kind: 'air-entrained', label: 'Air in the system', group: 'System', target: 'fluid', description: 'Air trapped after service or drawn in – spongy, erratic operation.', typicalSymptoms: ['Foamy fluid', 'Spongy, jerky movement', 'Gauge needle fluctuation'], repairs: ['bleed-air'] },
];

export const FAULT_INFO = new Map(FAULT_KINDS.map((f) => [f.kind, f]));

export function faultInfo(kind: string): FaultKindInfo {
  const f = FAULT_INFO.get(kind);
  if (!f) throw new Error(`Unknown fault kind ${kind}`);
  return f;
}

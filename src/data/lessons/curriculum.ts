export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number;
  why: string;
}

export interface LessonSection {
  heading: string;
  body: string[];
  formula?: string;
  callout?: { tone: 'info' | 'warn' | 'danger'; text: string };
}

export interface Lesson {
  id: string;
  level: number;
  title: string;
  minutes: number;
  objectives: string[];
  sections: LessonSection[];
  activities: { label: string; href: string }[];
  quiz: QuizQuestion[];
}

export const LEVELS = [
  { level: 1, title: 'Hydraulic fundamentals', summary: 'Pascal, pressure vs flow, force, displacement, fluid, reservoir, filtration, cooling, cavitation, aeration and contamination.' },
  { level: 2, title: 'Hydraulic components', summary: 'Pumps, valves, actuators and supporting components – how each works inside.' },
  { level: 3, title: 'Hydraulic circuits', summary: 'Reading schematics, identifying lines and ports, assembling and verifying circuits.' },
  { level: 4, title: 'Equipment operation', summary: 'Operating complete equipment: PTO, controls, normal characteristics and inspection.' },
  { level: 5, title: 'Maintenance and repair', summary: 'Safe isolation, leak identification, component replacement, adjustment and post-repair testing.' },
  { level: 6, title: 'Advanced diagnostics', summary: 'Intermittent, load- and temperature-dependent and multiple simultaneous faults.' },
];

export const LESSONS: Lesson[] = [
  {
    id: 'l1-pascal', level: 1, title: 'What hydraulics is – Pascal’s principle', minutes: 15,
    objectives: ['Explain Pascal’s principle', 'Calculate force from pressure and area'],
    sections: [
      { heading: 'Power through a liquid', body: ['Hydraulics transmits power by pushing an (almost) incompressible liquid. A pump converts mechanical power into flow; actuators convert flow and pressure back into motion and force.', 'Pressure applied to a confined fluid is transmitted undiminished in all directions (Pascal). A small piston at a given pressure produces a large force on a large piston.'], formula: 'P = F / A      F = P × A' },
      { heading: 'Units', body: ['Pressure: 1 bar = 100 kPa ≈ 14.5 psi. Force: N or kN. Area: m² (or cm², in²). Always convert to consistent units before calculating.'] },
    ],
    activities: [{ label: 'Lab: operate a manual hydraulic pump', href: 'fundamentals' }, { label: 'Formula calculator', href: 'fundamentals' }],
    quiz: [
      { q: 'A 100 mm bore cylinder lifts 78.5 kN. Pressure required (ignoring friction) is about…', options: ['10 bar', '100 bar', '785 bar', '7.85 bar'], answer: 1, why: 'A = π×0.1²/4 = 0.00785 m²; P = 78 500/0.00785 = 10 MPa = 100 bar.' },
      { q: 'Pascal’s principle says pressure in a confined fluid…', options: ['Is highest at the pump', 'Acts equally in all directions', 'Depends on pipe length only', 'Is always 0 in the reservoir'], answer: 1, why: 'Static pressure acts equally in all directions throughout the confined fluid.' },
    ],
  },
  {
    id: 'l1-pressure-flow', level: 1, title: 'Pressure versus flow', minutes: 20,
    objectives: ['Distinguish pressure from flow', 'Explain that pumps create flow and loads create pressure'],
    sections: [
      { heading: 'Flow makes it move – pressure makes it push', body: ['Flow (L/min) determines how FAST an actuator moves. Pressure (bar) determines how much FORCE it can produce.', 'A positive-displacement pump delivers a volume per revolution whatever the resistance. Pressure rises only as far as needed to push that flow through the resistance – the load, restrictions or, ultimately, the relief valve.'], formula: 'Q = Vd × n × ηv       v = Q / A' },
      { heading: 'Diagnostic consequence', body: ['Slow but strong = a FLOW problem (pump, PTO speed, leakage, restriction). Strong enough empty but stalls loaded at a consistent pressure = a PRESSURE-limiting problem (relief setting, pump unable to build pressure).'], callout: { tone: 'info', text: 'A gauge reading high pressure does not mean the pump is good – it means something is resisting flow.' } },
    ],
    activities: [{ label: 'Experiment: pressure versus flow', href: 'playground' }, { label: 'Lab: generate pressure', href: 'fundamentals' }],
    quiz: [
      { q: 'Doubling pump speed (same load) will…', options: ['Double cylinder speed', 'Double pressure', 'Halve force', 'Have no effect'], answer: 0, why: 'Flow doubles; pressure is set by the load.' },
      { q: 'A cylinder lifts slowly but always reaches full height with full load. The problem is most likely…', options: ['Relief set too low', 'Insufficient flow', 'Load too heavy', 'Fluid too clean'], answer: 1, why: 'It has the force (pressure) but not the speed (flow).' },
    ],
  },
  {
    id: 'l1-fluid', level: 1, title: 'Hydraulic fluid, reservoir, filtration and cooling', minutes: 20,
    objectives: ['Explain viscosity and temperature effects', 'Describe reservoir, filter and cooler functions'],
    sections: [
      { heading: 'The fluid', body: ['Hydraulic oil transmits power, lubricates, seals clearances and carries heat away. Viscosity falls sharply with temperature: cold oil raises pressure drops and suction vacuum; hot oil increases internal leakage.', 'Use only the fluid grade specified by the equipment manufacturer.'] },
      { heading: 'Reservoir, filtration, cooling', body: ['The reservoir stores the volume that actuators draw, releases entrained air and settles contaminants. Check level with actuators retracted.', 'Filters remove particles; a loaded element raises Δp until its bypass opens – then unfiltered oil circulates. All power lost in the system becomes heat; the cooler and tank surfaces reject it.'] },
    ],
    activities: [{ label: 'Fluid properties chart', href: 'fundamentals' }, { label: 'Lab: clogged filter', href: 'fundamentals' }],
    quiz: [{ q: 'A filter in bypass protects…', options: ['The pump', 'The filter element', 'The cylinder seals', 'Nothing'], answer: 1, why: 'The bypass prevents element collapse; it lets unfiltered oil through.' }],
  },
  {
    id: 'l1-cavitation', level: 1, title: 'Cavitation, aeration and contamination', minutes: 20,
    objectives: ['Distinguish cavitation from aeration', 'Identify sources of contamination'],
    sections: [
      { heading: 'Cavitation', body: ['When pump inlet pressure falls too low (restricted suction, cold thick oil, high speed, clogged strainer), vapour and dissolved air form bubbles that collapse violently in the pump – a high-pitched whine and erosion.'] },
      { heading: 'Aeration', body: ['Air drawn INTO the fluid (low level, loose suction fitting, return line above the oil) causes foam, a growling noise, spongy operation and gauge flutter.'] },
      { heading: 'Contamination', body: ['Particles, water and wrong fluids cause wear, sticking spools and seal damage. Prevent ingress: cap open lines, clean before opening, filter new oil.'], callout: { tone: 'warn', text: 'Most hydraulic failures start with contamination or heat.' } },
    ],
    activities: [{ label: 'Lab: introduce air', href: 'fundamentals' }, { label: 'Scenario: pump screams in cold weather', href: 'diagnostics' }],
    quiz: [{ q: 'Foamy oil and a growling pump suggest…', options: ['Cavitation from a restricted suction', 'Aeration – air entering the system', 'Relief stuck open', 'Worn cylinder seals'], answer: 1, why: 'Foam means air is entering; cavitation is a vapour/vacuum problem at the inlet.' }],
  },
  {
    id: 'l2-pumps', level: 2, title: 'Pumps', minutes: 25,
    objectives: ['Explain gear, vane and piston pump operation', 'Relate slip to pressure and viscosity'],
    sections: [{ heading: 'Positive displacement', body: ['Gear pumps carry oil around the outside of the gears. Vane pumps use vanes in a cam ring. Piston pumps can vary displacement with a swashplate and compensator.', 'All leak internally (slip). Volumetric efficiency = actual flow / theoretical flow and must be measured at working pressure and temperature.'] }],
    activities: [{ label: 'Component library: gear pump cutaway', href: 'components' }, { label: 'Experiment: pump wear', href: 'playground' }],
    quiz: [{ q: 'Where does oil travel in an external gear pump?', options: ['Through the centre between the gears', 'Around the outside between teeth and housing', 'Through the shaft', 'Through the relief'], answer: 1, why: 'Oil is trapped in tooth spaces and carried around the housing wall.' }],
  },
  {
    id: 'l2-valves', level: 2, title: 'Valves: direction, pressure and flow', minutes: 30,
    objectives: ['Explain spool centre conditions', 'Compare relief and reducing valves', 'Explain counterbalance and pilot-operated checks'],
    sections: [
      { heading: 'Directional valves', body: ['Spool positions connect P, T, A and B. The centre condition determines neutral behaviour. Spool valves leak slightly – they are not leak-tight load holders.'] },
      { heading: 'Pressure valves', body: ['Relief: normally closed, senses inlet, limits maximum pressure. Reducing: normally open, senses outlet, limits branch pressure. Unloading: piloted by a remote signal. Counterbalance: holds and controls overrunning loads.'] },
      { heading: 'Flow valves', body: ['Needle valves meter flow but vary with load; pressure-compensated flow controls hold constant Δp across the orifice. Check valves allow one-way flow; pilot-operated checks hold loads until piloted open.'] },
    ],
    activities: [{ label: 'Compare relief vs reducing valve', href: 'components' }, { label: 'Experiment: relief valve operation', href: 'playground' }],
    quiz: [
      { q: 'Which valve is normally open and senses its outlet?', options: ['Relief', 'Reducing', 'Check', 'Unloading'], answer: 1, why: 'A reducing valve throttles as outlet pressure approaches its setting.' },
      { q: 'A counterbalance valve is typically set at…', options: ['Below the load pressure', '≈1.3× the maximum load-induced pressure', 'Equal to the main relief', 'Zero'], answer: 1, why: 'Above the load pressure so it holds; pilot assists opening for controlled lowering.' },
    ],
  },
  {
    id: 'l2-actuators', level: 2, title: 'Actuators and supporting components', minutes: 20,
    objectives: ['Calculate cylinder force and speed', 'Explain telescopic hoist pressure steps', 'Identify accumulator hazards'],
    sections: [
      { heading: 'Cylinders and motors', body: ['Extension force = p × bore area; retraction = p × annulus area. Telescopic hoists extend largest stage first – pressure steps up as smaller stages take over.', 'Motors: speed = Q/Vd, torque = Vd·Δp/2π.'] },
      { heading: 'Accumulators', body: ['Store oil under gas pressure and stay pressurised after shutdown. Always bleed down and verify zero before opening a circuit with an accumulator.'], callout: { tone: 'danger', text: 'Stored energy: accumulators, raised loads and trapped pressure can all release violently.' } },
    ],
    activities: [{ label: 'Experiment: cylinder force and bore', href: 'playground' }, { label: 'Component library', href: 'components' }],
    quiz: [{ q: 'Same pressure: which produces more force?', options: ['Extension (cap end)', 'Retraction (rod end)', 'Equal', 'Depends on flow'], answer: 0, why: 'Cap-end area is larger than the annulus.' }],
  },
  {
    id: 'l3-schematics', level: 3, title: 'Reading hydraulic schematics', minutes: 25,
    objectives: ['Recognise ISO 1219 symbols', 'Trace pressure, return, suction, pilot and drain lines'],
    sections: [{ heading: 'Symbols describe function, not appearance', body: ['Squares are valve positions, arrows show flow paths, circles are energy converters (pumps/motors), dashed lines are pilots/drains. Valves are drawn in their neutral (spring) position.', 'Trace a circuit from the reservoir S port through the pump and valves to the actuators, then back through the return filter.'] }],
    activities: [{ label: 'Hydraulic Schematics viewer', href: 'schematics' }, { label: 'Line identification', href: 'schematics' }],
    quiz: [{ q: 'Valve symbols are drawn in which position?', options: ['Energised', 'Neutral/spring position', 'Random', 'Most-used position'], answer: 1, why: 'Schematics show the de-energised (normal) condition.' }],
  },
  {
    id: 'l3-ports', level: 3, title: 'Ports, line identification and routing', minutes: 25,
    objectives: ['Identify lines by port markings', 'Explain the consequences of mis-connection'],
    sections: [
      { heading: 'Port markings are authoritative', body: ['P, T, A, B, S, L/CD, X/Y, LS. Trace each hose to the stamped marking and compare with the manufacturer schematic. Hose colour, tags and previous technicians can all be wrong.'], callout: { tone: 'warn', text: 'Never rely on hose colour to identify a line.' } },
      { heading: 'Typical mistakes', body: ['P and T reversed (relief bypassed, functions reversed), cylinder hoses crossed (functions reversed), case drain to a pressurised line (seal failure), pump inlet on a return port (air ingestion), restricted suction (cavitation).'] },
    ],
    activities: [{ label: 'Circuit Builder exercises', href: 'circuit-builder' }, { label: 'Scenario: strange behaviour after valve replacement', href: 'diagnostics' }],
    quiz: [{ q: 'Hoses are reversed between a valve’s P and T ports. The most dangerous result is…', options: ['Slower operation', 'The relief may no longer protect the pump', 'Higher fluid level', 'Quieter pump'], answer: 1, why: 'If the relief now sits on the return side, the pump can dead-head with no protection.' }],
  },
  {
    id: 'l3-build', level: 3, title: 'Assembling and verifying circuits', minutes: 30,
    objectives: ['Assemble a working circuit', 'Verify by validation and operation'],
    sections: [{ heading: 'Build, check, then run', body: ['Check every connection against the schematic before running. Then run at low speed and verify each function moves in the commanded direction and the relief limits pressure.'] }],
    activities: [{ label: 'Circuit Builder', href: 'circuit-builder' }, { label: 'Playground: free build', href: 'playground' }],
    quiz: [{ q: 'Before first start-up of a newly assembled circuit you should…', options: ['Run at full speed to purge air', 'Verify connections against the schematic', 'Set relief to maximum', 'Remove the filter'], answer: 1, why: 'Verify first; then start at idle and purge air slowly.' }],
  },
  {
    id: 'l4-dumptruck', level: 4, title: 'Operating a hydraulic dump truck', minutes: 25,
    objectives: ['Start-up and PTO engagement sequence', 'Normal operating characteristics'],
    sections: [
      { heading: 'Sequence', body: ['Park on firm level ground, set the parking brake, start the engine with the PTO switch OFF. At idle, engage the PTO (interlocks typically require idle speed and parking brake). Raise engine speed to the specified hoist speed and raise; release to HOLD; lower to the stops; disengage the PTO before driving.'] },
      { heading: 'Normal characteristics', body: ['Pressure steps as each telescopic stage extends; pressure falls as material slides out; at full extension the relief limits pressure with a steady hiss. Do not hold the control at end of stroke – it turns all pump power into heat.'], callout: { tone: 'danger', text: 'Never work under a raised body unless it is mechanically supported by the body prop.' } },
    ],
    activities: [{ label: 'Equipment Simulator', href: 'simulator' }, { label: 'Scenario: pre-delivery check', href: 'diagnostics' }],
    quiz: [{ q: 'The PTO will not engage with the engine at 1500 rpm. Likely reason…', options: ['Broken pump', 'Engagement interlock – engage at idle', 'Low fluid', 'Relief stuck open'], answer: 1, why: 'Many PTOs (and the training truck) only allow engagement at low engine speed.' }],
  },
  {
    id: 'l4-inspection', level: 4, title: 'Equipment inspection', minutes: 20,
    objectives: ['Perform a structured inspection', 'Recognise evidence that only appears under pressure'],
    sections: [{ heading: 'Systematic inspection', body: ['Work zone by zone: engine/PTO/pump, hydraulic system, body/cylinder, controls. Check level with the body down, filter indicator, leaks (static and under pressure), breather discharge, noises, and mounting hardware.'] }],
    activities: [{ label: 'Virtual Workshop – inspection mode', href: 'workshop' }],
    quiz: [{ q: 'A pin-hole leak should be located with…', options: ['Your hand', 'A piece of cardboard', 'Compressed air', 'A rag held against it'], answer: 1, why: 'High-pressure jets can inject fluid through skin – a medical emergency.' }],
  },
  {
    id: 'l5-safety', level: 5, title: 'Safe isolation and stored energy', minutes: 25,
    objectives: ['Apply lockout/tagout', 'Relieve and verify zero pressure', 'Control raised loads and accumulators'],
    sections: [
      { heading: 'Sequence', body: ['Park and chock. Lower loads or support them mechanically. Stop engine and PTO. Relieve trapped pressure (cycle controls key-on engine-off). Apply lockout/tagout. VERIFY zero pressure with a gauge before opening any line.'] },
      { heading: 'Hazards', body: ['Fluid injection injuries, hose whip, hot fluid (> 60 °C burns), falling loads, accumulators, rotating drive shafts.'], callout: { tone: 'danger', text: 'This simulator does not replace site-specific procedures, manufacturer manuals or qualified instruction.' } },
    ],
    activities: [{ label: 'Repair Workshop procedures', href: 'repair' }],
    quiz: [{ q: 'Which step proves the circuit is safe to open?', options: ['Engine stopped', 'Key removed', 'A gauge reads zero at the test points', 'The body is down'], answer: 2, why: 'Only a measurement proves no trapped pressure remains.' }],
  },
  {
    id: 'l5-replace', level: 5, title: 'Component replacement and compatibility', minutes: 30,
    objectives: ['Follow an equipment-specific replacement procedure', 'Validate replacement compatibility'],
    sections: [{ heading: 'Same type ≠ interchangeable', body: ['Check displacement, rotation, shaft, mounting, port threads, pressure and flow ratings, electrical voltage and fluid compatibility. A pump of the wrong rotation bolts on and then pumps backwards.', 'Tag lines before disconnecting, cap ports immediately, torque to documented values, verify routing, prime, bleed, then test.'] }],
    activities: [{ label: 'Repair Workshop – replace pump', href: 'repair' }],
    quiz: [{ q: 'A replacement pump has the correct flange, shaft and ports but opposite rotation. Result?', options: ['Works normally', 'No flow to the system; suction side pressurised', 'Runs faster', 'Lower pressure only'], answer: 1, why: 'It will attempt to pump from outlet to inlet.' }],
  },
  {
    id: 'l5-adjust', level: 5, title: 'Valve adjustment and post-repair testing', minutes: 25,
    objectives: ['Measure before adjusting', 'Adjust against a verified specification and re-test'],
    sections: [{ heading: 'Measure – adjust – re-test', body: ['Identify the valve and its purpose, locate the adjuster, find the documented specification, warm the oil, measure at the correct test point and speed, adjust in small increments with the control in neutral, lock, re-test and record.', 'Never raise a relief setting to compensate for a worn pump or other fault.'] }],
    activities: [{ label: 'Valve adjustment training', href: 'repair?tab=adjust' }, { label: 'Scenario: lifts empty but stalls loaded', href: 'diagnostics' }],
    quiz: [{ q: 'A slow hoist with normal relief pressure needs…', options: ['A higher relief setting', 'Flow diagnosis (pump, PTO, leakage)', 'A larger cylinder', 'Thicker oil'], answer: 1, why: 'Speed is flow; the relief only limits pressure.' }],
  },
  {
    id: 'l6-strategy', level: 6, title: 'Systematic fault isolation', minutes: 30,
    objectives: ['Apply a hypothesis-driven method', 'Choose the test that best splits the system'],
    sections: [{ heading: 'Method', body: ['1 Verify the complaint by operating. 2 Gather symptoms (sight, sound, smell, indicators). 3 List hypotheses ranked by likelihood. 4 Choose tests that split the system in half (e.g. pump flow test separates supply from consumers). 5 Confirm with measurement. 6 Repair the cause, not the symptom. 7 Verify by operation.'] }],
    activities: [{ label: 'Diagnostic challenges', href: 'diagnostics' }],
    quiz: [{ q: 'Which single test best separates "pump problem" from "everything downstream"?', options: ['Visual inspection', 'Loaded pump flow test at the pump outlet', 'Fluid sample', 'Cylinder drift test'], answer: 1, why: 'It measures what the pump can deliver at pressure independent of the rest of the circuit.' }],
  },
  {
    id: 'l6-intermittent', level: 6, title: 'Intermittent, load- and temperature-dependent faults', minutes: 30,
    objectives: ['Reproduce intermittent faults', 'Test under the conditions that trigger the fault'],
    sections: [{ heading: 'Reproduce first', body: ['Ask when it happens: hot? loaded? after a long run? Recreate those conditions – warm the oil, apply rated load, cycle repeatedly. Measure during the failure: voltage at the device under load, pump flow at temperature, PTO input vs output speed under load.'] }],
    activities: [{ label: 'Master technician scenarios', href: 'diagnostics' }],
    quiz: [{ q: 'A solenoid works on the bench but fails on the truck under load. Best test?', options: ['Coil resistance cold', 'Voltage at the connector while energised and loaded', 'Replace the coil', 'Check fluid level'], answer: 1, why: 'Voltage drop across a corroded connector only shows when current flows.' }],
  },
  {
    id: 'l6-multi', level: 6, title: 'Multiple simultaneous faults and hydraulic–electrical interaction', minutes: 30,
    objectives: ['Recognise interacting faults', 'Verify every repair'],
    sections: [{ heading: 'When one fix is not enough', body: ['Faults often coexist and one can cause another: restricted suction accelerates pump wear; contamination causes sticking valves; a stuck-closed relief damages hoses and PTO gears. After each repair re-test – if symptoms remain, the diagnosis is not finished.'] }],
    activities: [{ label: 'Master technician scenarios', href: 'diagnostics' }],
    quiz: [{ q: 'You replaced a worn pump; the new pump whines and the inlet vacuum is high. Next?', options: ['Replace the pump again', 'Investigate the suction restriction that likely caused the first failure', 'Raise the relief', 'Ignore it'], answer: 1, why: 'Fix the root cause or the new pump will fail too.' }],
  },
];

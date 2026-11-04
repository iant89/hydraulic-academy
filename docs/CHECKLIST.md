# Implementation checklist

Status legend: Not started · In progress · Implemented · Tested (automated tests) · Verified (exercised end-to-end in the browser)

| Area | Feature | Status |
|---|---|---|
| Foundation | Vite + React + strict TypeScript, CSS Modules, design tokens | Verified |
| Foundation | Adaptive navigation (desktop / tablet rail / mobile drawer), 15 sections | Verified (e2e navigation) |
| Foundation | IndexedDB persistence behind an adapter interface; localStorage for prefs | Tested |
| Simulation | Network solver (implicit, Newton + line search), ports, connections, hoses | Tested |
| Simulation | Pumps (gear, vane, piston PC, manual), valves (relief, DCV ×5 centres, check, pilot check, counterbalance, reducing, flow control, unloading, priority), cylinder (single/double/telescopic), motor/rotary, reservoir, filter, cooler, accumulator, orifice, instruments | Tested |
| Simulation | Fluid temperature, viscosity, aeration, contamination, external/internal leakage, cavitation | Tested |
| Simulation | Pause/resume/reset/time scale, snapshots, event log, determinism | Tested |
| Simulation | Fault propagation, intermittent/load/temperature activation, progression, secondary damage | Tested |
| Equipment | Dump truck package (engine, PTO, pump, reservoir, lines, DCV, relief, filter, cooler, telescopic hoist, body, controls) | Verified |
| Equipment | Electrical controls (solenoids, wiring, interlocks) | Tested |
| Visualization | 3D truck: body/cylinder kinematics, PTO/pump rotation, hose flow animation, pressure colouring, leak spray, inspection hotspots | Verified |
| Visualization | Live ISO-style schematic (flow animation, pressure map, active spool box, test points, readings) | Verified |
| Visualization | Live and interactive cutaways (gear pump, spool, relief, cylinder, PTO) | Implemented |
| Visualization | Instrument gauges, flow tester, tach, multimeter, IR, fluid sample, sight glass, drift test | Tested (engine) / Verified (UI) |
| Diagnostics | 20 scenarios (13 required + intermittent + multi-fault master) with separate hidden keys | Tested |
| Diagnostics | Observations from simulation state; workspace (complaint, checklist, tests, history, hypotheses, confirmed failures, schematic, repair history) | Verified (e2e) |
| Diagnostics | Scoring: identification, tests, sequence, replacement, efficiency, safety, verification | Tested |
| Workshop | Bay environment, structured inspection with scoring, component isolation, tool inventory | Implemented |
| Repair | Data-driven procedures with enforced safety prerequisites; disconnection/capping, removal, bench tests, part compatibility, reconnection (mis-connection possible), torque spec provenance, restore/bleed | Tested + Verified (e2e) |
| Repair | Valve adjustment training (relief), measure-adjust-retest log | Implemented |
| Profiles | Built-in generic profiles, provenance per spec, documents, profile → machine, editor with uploads, provenance validation | Tested (loading) / Verified (UI) |
| Playground | 8 prebuilt experiments, free build editor, parameter validation, fault injection, recording, save/load, comparison | Tested (engine) / Verified (UI) |
| Circuit builder | 8 exercises, net-based validation, explanations, operational check | Tested |
| Learning | 6-level curriculum, 18 lessons, quizzes, progression gating, fundamentals labs | Implemented |
| Assessment | Requirements, practical exam pools, competency profile, weak areas, completion records with disclaimer | Implemented |
| Records | History, performance report, CSV/JSON export | Implemented |
| Expansion | Additional equipment (service truck, roll-off, crane, excavator, loader, skid steer, HPU) | Not started – template registry is in place; all would reuse the engine |

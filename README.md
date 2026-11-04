# Hydraulic Academy

An interactive hydraulic systems training, simulation, diagnostics and maintenance platform for technicians. Learners operate equipment, trace lines, build circuits, measure pressure and flow, diagnose hidden failures, repair components under enforced safety procedures, and verify repairs by operating the equipment – all on one physically based hydraulic simulation engine.

> **Training simulator.** Not a substitute for manufacturer service documentation, qualified instruction or site-specific safety requirements. All built-in equipment values are **simulated training values**, clearly labelled, and never presented as manufacturer specifications.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit/integration tests (Vitest)
npm run test:e2e   # browser workflows (Playwright; builds and serves on :4173)
npm run typecheck
npm run build
```

Runs fully offline – no external services. Data is stored locally (IndexedDB).

### Deployment (GitHub Pages)

Every push to `main` runs `.github/workflows/deploy-pages.yml`: install, typecheck, unit tests, build, and deploy `dist/` to GitHub Pages. The build uses relative asset paths and hash routing, so it works at `https://<owner>.github.io/hydraulic-academy/` without configuration. One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## What’s in it

| Section | What the technician does |
|---|---|
| Dashboard | Progress, current level, recommendations, diagnostic performance, recent mistakes, achievements |
| Learning Center | 6-level curriculum (fundamentals → advanced diagnostics), lessons linked to practical activities, knowledge checks, progression gating |
| Hydraulic Fundamentals | Interactive labs (manual pump/Pascal, pressure vs flow, restrictions, cylinder size, displacement, air, clogged filter), formula calculator, viscosity chart |
| Component Library | Searchable reference with ISO symbols, interactive cutaways, failure modes, tests, replacement considerations, comparisons, quizzes |
| Circuit Builder | 8 guided exercises – connect real ports; validation explains what is wrong, why, the consequence and the fix; operational test on the engine |
| Equipment Simulator | 3D dump truck or service-truck crane + live schematic; operator controls (key, throttle, parking brake, PTO, hoist, E-stop); fluid-flow, pressure and cutaway modes; inspection zones; instruments; practice fault injection |
| Hydraulic Playground | 8 prebuilt experiments, free circuit editor, parameter validation, failure injection, recording, saving and comparison |
| Virtual Workshop | Workshop bay, structured inspection with scoring, component isolation, tool inventory |
| Diagnostic Center | 20 symptom-based scenarios across Guided / Practical / Challenge / Master modes, hidden faults, hypotheses, measurement history, confirmed failures, verification and a detailed report |
| Repair Workshop | Equipment-specific procedures with enforced isolation (LOTO, depressurise, verify zero), tagging, capping, removal, bench testing, compatibility-checked parts, reconnection (mistakes are simulated), torque-spec provenance, valve adjustment training |
| Equipment Profiles | Manufacturer/equipment configurations built from reusable components, specification provenance (manufacturer-verified / technician-provided / simulated), documents, editor |
| Hydraulic Schematics | Live schematic of the work-bay equipment, reference circuits, line-identification guidance |
| Assessments / Records | Requirements, practical exams, competency profile, completion records (not professional qualifications), exports |

## Architecture

```
src/
  simulation/          ← authoritative physics; no React/Three.js
    core/              units, deterministic RNG, linear algebra
    physics/           formulas, fluid properties, flow relations
    hydraulics/        network solver, circuit simulation, types
    components/        reusable component models + registry
    circuits/          circuit library, topology validation
    failures/          fault catalogue, activation & progression
    machine/           engine, PTO, electrical controls, mechanisms
    sensors/           diagnostic instruments
    scenarios/         observations, operation tracker, diagnostic session & scoring
  equipment/           equipment definitions as data (dump-truck), profiles → machines, compatibility
  workshop/            service procedures (job runner), bench tests
  data/                lessons, labs, exercises, parts, profiles, scenarios (briefs vs hidden keys)
  visualization/       schematic renderer, 3D truck, cutaways, instruments
  components/          UI primitives and shared equipment/circuit panels
  modules/             one folder per application section
  services/            persistence adapter (IndexedDB), training records
  stores/              Zustand stores (prefs, training, shared work bay, jobs)
```

Key principles:

* **One engine, one truth.** The equipment simulator, playground, circuit builder, labs, bench tests, workshop and diagnostics all run `HydraulicSimulation`. Visualizations and instruments only read it.
* **Data-driven equipment.** A machine is a `MachineDefinition` (circuit + engine/PTO + operator functions + electrical + mechanisms + test points). Profiles override parameters; no vehicle-specific hydraulics. Two packages ship: **001 hydraulic dump truck** and **002 service truck with telescopic crane** – both built from the same component models.
* **Hidden faults stay hidden.** Scenario briefs and keys are separate modules; keys load on demand only into the diagnostic engine. Observations are derived from simulation state, never from fault names.
* **Repairs change the simulation.** Disconnecting, capping, replacing, re-routing and adjusting rebuild the live circuit while preserving state; success is proven only by operating the equipment.

See [`docs/SIMULATION.md`](docs/SIMULATION.md) for every modelling approximation and [`docs/CHECKLIST.md`](docs/CHECKLIST.md) for implementation status.

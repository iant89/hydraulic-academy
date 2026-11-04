# Hydraulic simulation engine – model and approximations

The engine (`src/simulation/`) is independent of React and Three.js. The UI never computes hydraulic quantities; it only reads the engine.

## Units
SI internally: Pa (gauge), m³/s, m, N, °C, rpm for shafts. Conversion happens only at display (`core/units.ts`), selectable metric/imperial.

## Network model (`hydraulics/network.ts`)
* Every component port is a node; every hose is a two-terminal element between two nodes. Components add their own elements (orifices, leak paths, pump displacement, pistons).
* Each node has hydraulic capacitance C = V/β (hose volume split to its ends + component internal volumes; cylinder chamber volume changes with position).
* Each fixed step (Δt = 10 ms) solves C(p − p_old)/Δt = ΣQ_in(p) with **implicit (backward) Euler**, Newton iterations, a finite-difference Jacobian assembled per element, step limiting and a backtracking line search. Implicit integration keeps stiff oil compressibility stable and lets a dead-headed positive-displacement pump drive pressure up until a relief opens (or something fails).
* Free nodes are clamped at −0.99 bar gauge (vapour limit). A node pinned there is a cavitating void – mass is not conserved inside the void (accepted simplification, e.g. the rod side of an overrunning cylinder).
* Reservoir ports are fixed-pressure boundaries (static head at S). External leaks discharge to an atmosphere boundary and are tracked as lost volume.

## Fluid (`physics/fluid.ts`)
* Viscosity: Walther (ASTM D341) fit through the ISO VG grade’s 40 °C and 100 °C values. Density −0.065 %/K.
* Effective bulk modulus 1.0 GPa (oil + hose compliance) reduced by entrained air by a mixture rule.
* Single lumped fluid state per circuit: temperature, air fraction, contamination index (≈ISO 4406 >4 µm code), water, wear debris.
* Thermal: dC_T/dt = Σ dissipation (Q·Δp of dissipative elements + pump mechanical and slip losses) − cooler UA·ΔT·flow factor − ambient loss. Heat capacity from total fluid volume.

## Flow relations (`physics/flow.ts`)
* Orifice Q = Cd·A·√(2|Δp|/ρ)·sign(Δp), Cd = 0.62, regularised near Δp = 0 (transition 0.2 bar).
* Lines Δp = R·Q + K·Q|Q|: Hagen–Poiseuille laminar R plus a turbulent term (Darcy f = 0.03 + fitting K = 1.5), solved exactly for Q.
* Laminar leakage G·Δp scaled by μ_ref/μ.

## Components (`components/`)
| Model | Key approximation |
|---|---|
| Gear / vane pump | Q = Vd·n·fill − G·Δp. G from rated volumetric efficiency at test pressure; scales with viscosity; wear and gear-damage faults multiply G. Inlet fill falls from 0.8 bar abs toward vapour pressure (cavitation) and with entrained air. Rotation mismatch reverses flow. |
| Piston pump (PC) | Displacement fraction = clamp((p_comp + band − p_out)/band); leakage to case drain. |
| Relief valve | Closed below cracking; linear override to rated flow. Faults: stuck open (parallel orifice), stuck closed (no opening), seat leak, misadjusted (setting reduced). |
| Directional valve | Paths per spool position as orifices weighted by spool travel with overlap; spool moves at 1/shift-time; land leakage between work ports and P/T. |
| Check / pilot check / counterbalance | Cracking check + pilot-assisted reverse opening (pilot ratio, setting, 6 bar band). |
| Reducing, unloading, priority, flow control | Spool opening as linear function of sensed pressure difference over a band; compensated flow control uses tanh limiting. |
| Cylinder | Massless piston with viscous damping c and Coulomb seal friction: v = (pA·A_A − pB·A_B − F_load ∓ F_c)/c. Inertia neglected (slow hoists/booms). Telescopic stages extend largest-first. End stops clamp velocity. Single-acting rod side vents to atmosphere (bypass appears at the breather). |
| Motor / rotary actuator | Same massless approach with torque balance and optional angle limit. |
| Filter | Linear Δp ∝ μ, rising with loading (1−0.97c)⁻²; bypass valve in parallel; filtration reduces contamination index; loading grows with contamination × flow. |
| Accumulator | Isothermal gas law. |

## Machine layer (`machine/`)
* Engine: first-order speed response; droop when PTO torque demand exceeds available torque; stall if sustained > 1.35×.
* PTO: engagement requires engine running, speed ≤ engagement limit, parking brake (interlock) and the shift solenoid pulled in; slip grows with torque fraction; gear damage gives torque-dependent dropouts; coupling failure removes pump drive while the PTO reads engaged.
* Electrical: battery → switch → wire resistance → coil. Voltage at connector, current, pull-in threshold; open coil reads OL with supply voltage present.
* Operator functions: each machine declares named functions (dump: hoist; crane: stabilizer, rotation, boom lift, boom extend, winch) that command one directional valve by solenoid or lever. Safety systems can inhibit a direction of a function.
* Dump body: rigid body rotating about the rear hinge; cylinder length from geometry; load force from the gravity moment and the cylinder’s moment arm; material discharges above the discharge angle.
* Service crane: boom angle from the lift-cylinder length (rigid boom, pivot geometry); lift force = (boom weight at half length + rope tension at the sheave) × horizontal radius ÷ cylinder moment arm; extension cylinder carries the axial component of the extension section and rope load; winch motor sees a signed external torque from rope tension (overrunning when lowering, held by the counterbalance); cable length integrates drum rotation; slew is friction-loaded; the stabilizer is a linear spring after ground contact, saturating at its share of truck weight. Load-moment limiter (rated moment, halved without the stabilizer set) and anti-two-block cut out the motions that make the situation worse. Load swing and boom deflection are neglected.
* Load-holding valves have a manual bleed (service) input; the isolation procedure bleeds them only once loads are secured, otherwise it is recorded as a safety violation.

## Failures (`failures/`)
Faults are hidden data with severity and activation (always, temperature, load pressure, intermittent with seeded RNG, after operating time) and optional progression. Components read the effective severity. Secondary damage is induced by the simulation (hose burst at 4× working pressure; PTO overload → gear damage).

## Determinism
No wall clock and no `Math.random` in the engine. Seeded RNG state, component states, node pressures, fluid state and faults are all in snapshots; identical inputs reproduce identical results (unit-tested).

## Training values
All numbers in the built-in equipment are **simulated training values** – they are labelled as such in the UI and are not manufacturer specifications.

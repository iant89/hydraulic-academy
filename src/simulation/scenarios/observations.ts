import { BAR, LPM } from '../core/units';
import type { MachineSimulation } from '../machine/machine';
import { getModel } from '../components/registry';

export type Sense = 'sound' | 'sight' | 'touch' | 'smell' | 'indicator';

export interface Observation {
  id: string;
  sense: Sense;
  text: string;
  /** 0 = normal/informational, 1 = minor, 2 = significant, 3 = hazardous */
  level: 0 | 1 | 2 | 3;
  safety?: string;
}

export interface InspectionTargets {
  components?: string[];
  connections?: string[];
  electrical?: string[];
  pto?: boolean;
  engine?: boolean;
  controls?: boolean;
}

const lpm = (q: number) => q / LPM;

/**
 * Generate what a technician would see, hear, feel or smell at an
 * inspection point given the CURRENT simulation state. Faults are never
 * named; only physical evidence that results from them is described.
 * Some evidence only exists while the machine is operating.
 */
export function observe(m: MachineSimulation, t: InspectionTargets): Observation[] {
  const out: Observation[] = [];
  const sim = m.sim;
  const f = sim.faults;
  const running = m.controls.engineRunning;
  const pumpTurning = Math.abs(sim.getInput(m.def.pump, 'speed')) > 5;
  const add = (o: Observation) => out.push(o);

  if (t.engine) {
    add({ id: 'engine-state', sense: 'sound', level: 0, text: running ? `Engine running at about ${Math.round(m.engineRpm / 50) * 50} rpm.` : 'Engine is off.' });
    const demand = m.pumpTorque() * m.def.pto.ratio;
    if (running && demand > m.def.engine.availableTorque * 0.9) add({ id: 'engine-lug', sense: 'sound', level: 2, text: 'Engine lugs down heavily – note when in the cycle this happens.' });
  }

  if (t.pto) {
    if (m.pto.state === 'engaged' && f.severity('pto', 'pto-gear-damage') > 0) add({ id: 'pto-grind', sense: 'sound', level: 2, text: 'Grinding / irregular gear noise from the PTO housing while engaged.' });
    if (m.pto.state === 'engaged' && f.severity('pto', 'pto-slip') > 0.2 && m.pumpTorque() > m.def.pto.ratedTorque * 0.35) add({ id: 'pto-smell', sense: 'smell', level: 2, text: 'Hot, burnt-oil smell near the PTO under load.' });
    if (m.pto.state === 'engaged' && !pumpTurning) add({ id: 'pto-shaft', sense: 'sight', level: 2, text: 'PTO output flange turning – pump shaft/coupling guard area shows no matching rotation of the pump body markings.' });
    if (m.pto.state === 'engaged' && pumpTurning) add({ id: 'pto-ok', sense: 'sound', level: 0, text: 'PTO engaged; drive line turning smoothly.' });
    if (m.pto.state === 'disengaged' && m.controls.ptoSwitch && running) add({ id: 'pto-not', sense: 'sight', level: 1, text: 'PTO switch is ON but the PTO output is not turning.' });
  }

  for (const id of t.components ?? []) {
    const c = sim.components.get(id);
    if (!c) {
      if (m.removed.has(id)) add({ id: `${id}-removed`, sense: 'sight', level: 0, text: `${m.removed.get(id)!.label} is removed – ports capped.` });
      continue;
    }
    switch (c.type) {
      case 'pump-gear':
      case 'pump-vane':
      case 'pump-piston-pc': {
        if (!pumpTurning) break;
        const cav = sim.readout(id, 'cavitating') === 1;
        if (cav) add({ id: `${id}-whine`, sense: 'sound', level: 2, text: 'High-pitched whine/scream from the pump that rises with engine speed.' });
        if (sim.fluidState.airFraction > 0.015) add({ id: `${id}-growl`, sense: 'sound', level: 2, text: 'Irregular growling / marbles-in-a-can noise from the pump.' });
        if (f.severity(id, 'pump-gear-damage') > 0.2) add({ id: `${id}-rattle`, sense: 'sound', level: 2, text: 'Rattling, knocking noise from the pump body.' });
        const ir = sim.readout(id, 'outlet');
        if (!cav && sim.fluidState.airFraction <= 0.015 && f.severity(id, 'pump-gear-damage') <= 0.2) add({ id: `${id}-normal`, sense: 'sound', level: 0, text: `Pump running with a steady, even sound${ir > 100 * BAR ? ' (working hard)' : ''}.` });
        break;
      }
      case 'relief-valve': {
        const q = sim.readout(id, 'flow');
        const p = sim.readout(id, 'inlet');
        if (q > 3 * LPM && p > 60 * BAR) add({ id: `${id}-squeal`, sense: 'sound', level: 1, text: 'Steady hiss/squeal from the relief valve – it is passing flow at high pressure.' });
        else if (q > 3 * LPM) add({ id: `${id}-hiss`, sense: 'sound', level: 2, text: 'Rushing flow noise at the relief valve although system pressure is low.' });
        break;
      }
      case 'dcv': {
        const cmd = sim.getInput(id, 'command');
        const spool = sim.readout(id, 'spool');
        if (cmd !== 0) {
          if (Math.abs(spool - cmd) > 0.5) add({ id: `${id}-nomove`, sense: 'sound', level: 2, text: 'Solenoid clicks/buzzes when the control is operated, but the function does not respond.' });
          else add({ id: `${id}-click`, sense: 'sound', level: 0, text: 'Solenoid clicks when the control is operated.' });
        } else if (m.controls.hoist !== 0 && m.controls.ignition) {
          add({ id: `${id}-silent`, sense: 'sound', level: 2, text: 'No solenoid click at the valve when the control is operated.' });
        }
        break;
      }
      case 'cylinder': {
        const v = sim.readout(id, 'velocity');
        const ext = sim.readout(id, 'extension');
        const bypass = sim.leakRate[`${id}:bypass`] ?? 0;
        const rod = sim.leakRate[`${id}:rodseal`] ?? 0;
        if (bypass > 0.05 * LPM) add({ id: `${id}-breather`, sense: 'sight', level: 2, text: 'Oil mist and drips discharging from the cylinder breather/vent.' });
        if (rod > 0.02 * LPM) add({ id: `${id}-gland`, sense: 'sight', level: 2, text: 'Oil film running down the extended stage; drips from the gland.' });
        if ((sim.leakByElement[`${id}:rodseal`] ?? 0) > 0.3e-3 && rod <= 0.02 * LPM) add({ id: `${id}-gland-old`, sense: 'sight', level: 1, text: 'Dirt-caked oil residue around the gland.' });
        if (m.controls.hoist === 0 && ext > 0.05 && v < -0.0002) add({ id: `${id}-drift`, sense: 'sight', level: 2, text: `Raised body is slowly settling with the control in HOLD (≈${Math.abs(v * 60000).toFixed(0)} mm/min).` });
        if (Math.max(f.severity(id, 'cyl-binding'), f.severity(id, 'cyl-bent-rod')) > 0.2 && Math.abs(v) > 0.001) add({ id: `${id}-jerky`, sense: 'sight', level: 2, text: 'Movement is jerky/shuddering; creaking from mounts.' });
        if (f.severity(id, 'cyl-bent-rod') > 0.2 && ext > 0.2) add({ id: `${id}-bent`, sense: 'sight', level: 2, text: 'Visible run-out on an extended stage.' });
        break;
      }
      case 'reservoir': {
        const lvl = sim.readout(id, 'level');
        const below = sim.readout(id, 'belowMin') === 1;
        add({ id: `${id}-glass`, sense: 'sight', level: below ? 2 : 0, text: `Sight glass: level ${below ? 'BELOW the MIN mark' : 'between MIN and MAX'} (${Math.round(lvl * 100)} % of tank height).` });
        if (sim.fluidState.airFraction > 0.02) add({ id: `${id}-foam`, sense: 'sight', level: 2, text: 'Fluid in the sight glass is foamy/cloudy with bubbles.' });
        if (sim.fluidState.water > 1000) add({ id: `${id}-milky`, sense: 'sight', level: 2, text: 'Fluid appears milky.' });
        if (sim.fluidState.contamination > 20) add({ id: `${id}-dark`, sense: 'sight', level: 1, text: 'Fluid is dark.' });
        if (f.severity(id, 'reservoir-breather-blocked') > 0.3) add({ id: `${id}-breather`, sense: 'sight', level: 1, text: 'Breather cap is caked with mud; tank side panel slightly drawn in.' });
        const tt = sim.fluidState.temperature;
        if (tt > 70) add({ id: `${id}-hot`, sense: 'touch', level: 3, text: `Tank is very hot (${tt.toFixed(0)} °C by IR) – burn hazard.`, safety: 'Hot fluid: use IR thermometer, not hands.' });
        break;
      }
      case 'filter': {
        const by = sim.readout(id, 'bypassing') === 1;
        add({ id: `${id}-ind`, sense: 'indicator', level: by ? 2 : 0, text: by ? 'Filter restriction indicator in RED (bypass).' : 'Filter restriction indicator in GREEN.' });
        break;
      }
      case 'cooler': {
        if (f.severity(id, 'cooler-blocked') > 0.3) add({ id: `${id}-fins`, sense: 'sight', level: 1, text: 'Cooler core fins packed with mud and debris.' });
        break;
      }
    }
  }

  for (const id of t.connections ?? []) {
    const c = m.circuit.connections.find((x) => x.id === id);
    if (!c) continue;
    const label = c.label ?? id;
    if (m.disconnected.has(id)) {
      add({ id: `${id}-disc`, sense: 'sight', level: 1, text: `${label} is disconnected${[...m.capped].some((k) => k.startsWith(`${id}:`)) ? ' (ends capped)' : ' – ENDS NOT CAPPED'}.` });
      continue;
    }
    const pin = sim.leakRate[`hose:${id}:pinhole`] ?? 0;
    const fit = sim.leakRate[`hose:${id}:fitting`] ?? 0;
    const rup = sim.leakRate[`hose:${id}:rupture`] ?? 0;
    if (rup > 1 * LPM) add({ id: `${id}-burst`, sense: 'sight', level: 3, text: `${label}: hose burst – fluid spraying and pooling.`, safety: 'Stop the machine immediately. Keep clear of the spray.' });
    if (pin > 0.02 * LPM) add({ id: `${id}-pin`, sense: 'sight', level: 3, text: `${label}: fine mist/wet film along the hose cover (${lpm(pin).toFixed(2)} L/min).`, safety: 'Possible pin-hole jet – injection hazard. Locate with cardboard; never with hands.' });
    if (fit > 0.02 * LPM) add({ id: `${id}-fit`, sense: 'sight', level: 2, text: `${label}: fluid weeping at the ${c.to.component}-end fitting, dripping under pressure.` });
    const past = (sim.leakByElement[`hose:${id}:pinhole`] ?? 0) + (sim.leakByElement[`hose:${id}:fitting`] ?? 0);
    if (past > 0.3e-3 && pin <= 0.02 * LPM && fit <= 0.02 * LPM) add({ id: `${id}-residue`, sense: 'sight', level: 1, text: `${label}: oily, dirt-caked residue on and below the line.` });
    if (f.severity(id, 'suction-collapsed') > 0.3 && pumpTurning) add({ id: `${id}-flat`, sense: 'sight', level: 2, text: `${label}: hose appears flattened/soft near the pump inlet while running.` });
    if (f.severity(id, 'hose-restricted') > 0.3) add({ id: `${id}-kink`, sense: 'sight', level: 2, text: `${label}: hose is kinked against the frame rail.` });
    if (f.severity(id, 'suction-air-leak') > 0.3) add({ id: `${id}-clamp`, sense: 'sight', level: 1, text: `${label}: hose clamp at the pump flange is loose; slight wetness.` });
    add({ id: `${id}-route`, sense: 'sight', level: 0, text: `${label}: runs from port "${portMarking(m, c.from.component, c.from.port)}" on ${compLabel(m, c.from.component)} to port "${portMarking(m, c.to.component, c.to.port)}" on ${compLabel(m, c.to.component)}.` });
  }

  for (const id of t.electrical ?? []) {
    const cfg = m.def.electrical.find((e) => e.id === id);
    if (!cfg) continue;
    if (f.severity(id, 'wiring-high-resistance') > 0.2) add({ id: `${id}-corr`, sense: 'sight', level: 1, text: `${cfg.connector}: green corrosion on the terminals.` });
    if (f.severity(id, 'wiring-open') > 0.5) add({ id: `${id}-chafe`, sense: 'sight', level: 2, text: `Harness to ${cfg.connector}: insulation chafed through where it crosses the frame rail.` });
  }

  if (t.controls) {
    add({ id: 'ctl-pto-lamp', sense: 'indicator', level: 0, text: `PTO indicator lamp: ${m.pto.state === 'engaged' ? 'ON' : 'OFF'}.` });
    add({ id: 'ctl-park', sense: 'indicator', level: 0, text: `Parking brake: ${m.controls.parkingBrake ? 'SET' : 'RELEASED'}.` });
    if (m.controls.emergencyStop) add({ id: 'ctl-estop', sense: 'indicator', level: 2, text: 'Emergency stop is latched.' });
  }

  if (out.length === 0) out.push({ id: 'none', sense: 'sight', level: 0, text: 'No abnormal condition observed here under the current operating conditions.' });
  return out;
}

function compLabel(m: MachineSimulation, id: string) {
  return m.circuit.components.find((c) => c.id === id)?.label ?? id;
}

function portMarking(m: MachineSimulation, comp: string, port: string) {
  const def = m.circuit.components.find((c) => c.id === comp);
  if (!def) return port;
  return getModel(def.type).ports(def).find((p) => p.id === port)?.marking ?? port;
}

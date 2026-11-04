import { BAR } from '@/simulation/core/units';
import type { MachineSimulation } from '@/simulation/machine/machine';
import type { ComponentInstanceDefinition, ConnectionDefinition, PortRef } from '@/simulation/hydraulics/types';
import { compareToReference, validateCircuit } from '@/simulation/circuits/validation';
import { readGauge, GAUGES } from '@/simulation/sensors/instruments';
import { checkCompatibility, checkHose, type CompatibilityIssue } from '@/equipment/shared/compatibility';
import type { EquipmentProfile } from '@/equipment/shared/types';
import { partById, HOSES, type PartDefinition } from '@/data/parts/catalog';
import { benchTest, inspectRemoved, type BenchResult } from './bench';

export type Precondition =
  | 'parked'
  | 'body-lowered'
  | 'body-propped'
  | 'body-secured'
  | 'engine-off'
  | 'loto'
  | 'depressurised'
  | 'lines-disconnected'
  | 'removed'
  | 'part-selected'
  | 'installed'
  | 'reconnected'
  | 'engine-running'
  | 'no-loto';

export type StepOp =
  | 'review'
  | 'park'
  | 'lower-body'
  | 'raise-and-prop'
  | 'shutdown'
  | 'relieve-pressure'
  | 'loto'
  | 'verify-zero'
  | 'tag-lines'
  | 'disconnect-lines'
  | 'remove-hardware'
  | 'remove'
  | 'inspect-removed'
  | 'select-part'
  | 'install'
  | 'torque'
  | 'reconnect'
  | 'verify-connections'
  | 'replace-hose'
  | 'tighten'
  | 'replace-element'
  | 'replace-solenoid'
  | 'repair-wiring'
  | 'repair-pto'
  | 'free-spool'
  | 'clean-cooler'
  | 'top-up'
  | 'flush'
  | 'restore'
  | 'bleed'
  | 'test';

export interface ProcedureStep {
  id: string;
  title: string;
  instruction: string;
  op: StepOp;
  requires: Precondition[];
  safety?: string;
  optional?: boolean;
}

export interface Procedure {
  id: string;
  title: string;
  target: { kind: 'component' | 'connection' | 'electrical' | 'pto' | 'fluid'; id: string };
  summary: string;
  steps: ProcedureStep[];
  documentNote: string;
}

const PRE_TEXT: Record<Precondition, string> = {
  parked: 'Parking brake set and wheels chocked',
  'body-lowered': 'Gravity loads secured (body down / boom stowed, load landed)',
  'body-propped': 'Body raised and supported by the body prop',
  'body-secured': 'Gravity loads secured (body lowered or propped / boom stowed, load landed)',
  'engine-off': 'Engine stopped, PTO switched off',
  loto: 'Lockout/tagout applied',
  depressurised: 'Circuit verified at zero pressure',
  'lines-disconnected': 'All lines to the component disconnected and capped',
  removed: 'Component removed',
  'part-selected': 'Compatible replacement selected',
  installed: 'Replacement installed',
  reconnected: 'All lines reconnected',
  'engine-running': 'Engine running',
  'no-loto': 'Lockout removed',
};

export function preconditionText(p: Precondition) {
  return PRE_TEXT[p];
}

function commonIsolation(bodyReq: 'lowered' | 'propped', crane = false): ProcedureStep[] {
  return [
    { id: 'park', title: 'Position and secure the equipment', instruction: 'Park on level ground, set the parking brake and chock the wheels.', op: 'park', requires: [] },
    crane
      ? { id: 'body', title: 'Land the load and stow the boom', instruction: 'Lower any load to the ground and unhook it, retract the boom and lower it into its rest so no load is held by counterbalance valves.', op: 'lower-body', requires: ['parked'], safety: 'Never open a crane circuit while the boom or a load is held by trapped oil.' }
      : bodyReq === 'lowered'
        ? { id: 'body', title: 'Lower the dump body', instruction: 'Lower the body fully onto the frame so no load is held by trapped oil.', op: 'lower-body', requires: ['parked'], safety: 'Never rely on the hydraulic system to hold a raised body during service.' }
        : { id: 'body', title: 'Raise and prop the body', instruction: 'Raise the empty body and install the body prop so the body is mechanically supported.', op: 'raise-and-prop', requires: ['parked'], safety: 'Install the body prop before any work at or under the body.' },
    { id: 'shutdown', title: 'Shut down engine and PTO', instruction: 'Switch the PTO OFF, return controls to neutral, stop the engine.', op: 'shutdown', requires: ['parked', 'body-secured'] },
    { id: 'relieve', title: 'Relieve stored hydraulic energy', instruction: crane ? 'Key ON / engine OFF: cycle every control lever both ways, then open the manual bleed on each load-holding valve (loads already secured), then key OFF.' : 'Key ON / engine OFF: cycle the hoist control to LOWER and back to neutral to vent trapped pressure, then key OFF.', op: 'relieve-pressure', requires: ['engine-off', 'body-secured'], safety: 'Trapped pressure remains after shutdown. Accumulators (if fitted) must be bled per the manufacturer procedure.' },
    { id: 'loto', title: 'Apply lockout/tagout', instruction: 'Remove the key, lock the ignition/battery isolator and attach your personal tag.', op: 'loto', requires: ['engine-off'] },
    { id: 'zero', title: 'Verify zero pressure', instruction: 'Install a gauge at the test points and confirm 0 bar before opening any line.', op: 'verify-zero', requires: ['loto'], safety: 'Treat every line as pressurised until a gauge proves otherwise.' },
  ];
}

const restoreSteps = (): ProcedureStep[] => [
  { id: 'restore', title: 'Restore the equipment', instruction: 'Check fluid level (body lowered) and top up with the specified fluid, remove tools, remove lockout/tagout.', op: 'restore', requires: ['reconnected'] },
  { id: 'bleed', title: 'Prime and bleed', instruction: 'Start at idle, cycle the function slowly through full stroke several times to purge air. Re-check level.', op: 'bleed', requires: ['no-loto'] },
  { id: 'test', title: 'Test operation and verify the repair', instruction: 'Operate the equipment and complete every verification check in the simulator.', op: 'test', requires: ['no-loto'] },
];

export function replacementProcedure(m: MachineSimulation, componentId: string): Procedure {
  const comp = m.circuit.components.find((c) => c.id === componentId) ?? m.removed.get(componentId);
  const label = comp?.label ?? componentId;
  const isCrane = m.crane !== null;
  const bodyReq = comp?.type === 'cylinder' && !isCrane ? 'propped' : 'lowered';
  return {
    id: `replace:${componentId}`,
    title: `Replace ${label}`,
    target: { kind: 'component', id: componentId },
    summary: 'Equipment-specific removal and installation using the machine\'s actual connections.',
    documentNote: 'Generic training procedure. For real equipment follow the manufacturer service manual for this model and serial range.',
    steps: [
      { id: 'identify', title: `Identify the ${label}`, instruction: 'Confirm the component against the schematic and its data plate. Review this procedure and the specifications (with their source status).', op: 'review', requires: [] },
      ...commonIsolation(bodyReq, isCrane),
      { id: 'tag', title: 'Identify and tag hydraulic connections', instruction: 'Tag each line with the port marking it connects to, before disconnecting anything.', op: 'tag-lines', requires: ['depressurised'] },
      { id: 'disconnect', title: 'Disconnect and cap lines', instruction: 'Disconnect each line, catch fluid, and immediately cap and plug both the hose and the port.', op: 'disconnect-lines', requires: ['depressurised'], safety: 'Crack fittings slowly with a rag over them – stop if fluid sprays.' },
      { id: 'hardware', title: 'Remove mounting hardware', instruction: comp?.type === 'cylinder' ? 'Support the cylinder with a hoist; remove the top pin and base trunnion caps.' : 'Support the component; remove the mounting bolts.', op: 'remove-hardware', requires: ['lines-disconnected'] },
      { id: 'remove', title: `Remove the ${label}`, instruction: 'Remove the component and place it on the workbench.', op: 'remove', requires: ['lines-disconnected'] },
      { id: 'inspect', title: 'Inspect the removed component', instruction: 'Inspect for wear and damage; bench test where a test stand is available. Record findings – they confirm (or refute) the diagnosis.', op: 'inspect-removed', requires: ['removed'] },
      { id: 'select', title: 'Select a compatible replacement', instruction: 'Choose a part that matches type, mounting, shaft, rotation, ports, displacement and ratings for this equipment profile.', op: 'select-part', requires: ['removed'] },
      { id: 'install', title: 'Install the replacement', instruction: 'Install the new component and its mounting hardware.', op: 'install', requires: ['part-selected'] },
      { id: 'torque', title: 'Torque fasteners and fittings', instruction: 'Torque to the applicable specification. Confirm the source of the value before applying it.', op: 'torque', requires: ['installed'] },
      { id: 'reconnect', title: 'Reconnect hydraulic lines', instruction: 'Reconnect each tagged line to the port with the matching marking. Verify against the schematic – not hose colour.', op: 'reconnect', requires: ['installed'] },
      { id: 'verify', title: 'Verify fittings and routing', instruction: 'Check every connection against the schematic and the circuit validation report.', op: 'verify-connections', requires: ['reconnected'] },
      ...restoreSteps(),
    ],
  };
}

export function hoseProcedure(m: MachineSimulation, connectionId: string): Procedure {
  const c = m.circuit.connections.find((x) => x.id === connectionId);
  const label = c?.label ?? connectionId;
  return {
    id: `hose:${connectionId}`,
    title: `Replace hose – ${label}`,
    target: { kind: 'connection', id: connectionId },
    summary: 'Hose assembly replacement.',
    documentNote: 'Use hose of the specified size, construction and working pressure rating.',
    steps: [
      { id: 'identify', title: 'Identify the hose', instruction: 'Confirm both ends and port markings; check the layline for size and rating.', op: 'review', requires: [] },
      ...commonIsolation('lowered', m.crane !== null),
      { id: 'tag', title: 'Tag the line ends', instruction: 'Tag both ends with their port markings.', op: 'tag-lines', requires: ['depressurised'] },
      { id: 'disconnect', title: 'Disconnect and cap', instruction: 'Disconnect both ends and cap the ports.', op: 'disconnect-lines', requires: ['depressurised'] },
      { id: 'replace', title: 'Fit the new hose assembly', instruction: 'Select a hose with matching ID, construction and adequate working pressure.', op: 'replace-hose', requires: ['lines-disconnected'] },
      { id: 'reconnect', title: 'Reconnect', instruction: 'Connect each end to its tagged port; route without twists or kinks and clamp it.', op: 'reconnect', requires: ['lines-disconnected'] },
      { id: 'torque', title: 'Torque fittings', instruction: 'Torque the hose ends to the applicable specification.', op: 'torque', requires: ['reconnected'] },
      ...restoreSteps(),
    ],
  };
}

export function simpleProcedure(kind: 'fitting' | 'filter' | 'solenoid' | 'wiring' | 'pto' | 'spool' | 'cooler' | 'top-up' | 'flush', id: string, label: string, crane = false): Procedure {
  const op: Record<typeof kind, StepOp> = { fitting: 'tighten', filter: 'replace-element', solenoid: 'replace-solenoid', wiring: 'repair-wiring', pto: 'repair-pto', spool: 'free-spool', cooler: 'clean-cooler', 'top-up': 'top-up', flush: 'flush' };
  const titles: Record<typeof kind, string> = { fitting: 'Re-torque fitting', filter: 'Replace filter element', solenoid: 'Replace solenoid coil', wiring: 'Repair wiring / connector', pto: 'Repair PTO', spool: 'Clean and free valve spool', cooler: 'Clean cooler core', 'top-up': 'Top up hydraulic fluid', flush: 'Drain, flush and refill fluid' };
  const targetKind = kind === 'fitting' ? 'connection' : kind === 'solenoid' || kind === 'wiring' ? 'electrical' : kind === 'pto' ? 'pto' : kind === 'top-up' || kind === 'flush' ? 'fluid' : 'component';
  const steps: ProcedureStep[] = [
    { id: 'identify', title: `Identify: ${label}`, instruction: 'Confirm the item and review the procedure.', op: 'review', requires: [] },
    ...commonIsolation('lowered', crane),
    { id: 'work', title: titles[kind], instruction: `${titles[kind]} – ${label}.`, op: op[kind], requires: ['depressurised'] },
    { id: 'restore', title: 'Restore the equipment', instruction: 'Check fluid level, remove lockout/tagout.', op: 'restore', requires: ['loto'] },
    { id: 'bleed', title: 'Prime and bleed', instruction: 'Start at idle and cycle the function.', op: 'bleed', requires: ['no-loto'], optional: true },
    { id: 'test', title: 'Test operation', instruction: 'Operate and verify.', op: 'test', requires: ['no-loto'] },
  ];
  return { id: `${kind}:${id}`, title: `${titles[kind]} – ${label}`, target: { kind: targetKind, id }, summary: titles[kind], documentNote: 'Generic training procedure.', steps };
}

// ───────────────────────────── job runner ─────────────────────────────
export interface StepResult {
  ok: boolean;
  message: string;
  details?: string[];
  bench?: BenchResult | null;
  issues?: CompatibilityIssue[];
}

export interface ReconnectChoice {
  connection: string;
  from: PortRef;
  to: PortRef;
}

/**
 * Executes a procedure against a live machine. Every operation calls the
 * real MachineSimulation service methods, so the simulation state changes
 * exactly as the technician's actions dictate. Safety prerequisites are
 * enforced: a step cannot run until its preconditions are satisfied.
 */
export class WorkshopJob {
  done = new Set<string>();
  tags: Record<string, { from: PortRef; to: PortRef }> = {};
  selectedPart: PartDefinition | null = null;
  selectedHose: string | null = null;
  torqueAcknowledged = false;
  log: { step: string; ok: boolean; message: string; t: number }[] = [];
  installed = false;
  lines: string[];

  constructor(
    public readonly m: MachineSimulation,
    public readonly procedure: Procedure,
    public readonly profile: EquipmentProfile,
    public readonly reference: { connections: ConnectionDefinition[]; components: ComponentInstanceDefinition[] },
    private onRecord?: (type: 'safety' | 'replace' | 'repair', id: string, detail: string) => void,
  ) {
    const t = procedure.target;
    this.lines = t.kind === 'component' ? m.connectionsOf(t.id).map((c) => c.id) : t.kind === 'connection' ? [t.id] : [];
  }

  satisfied(p: Precondition): boolean {
    const m = this.m;
    switch (p) {
      case 'parked':
        return m.controls.parkingBrake && m.safety.wheelsChocked;
      case 'body-lowered':
        return m.loadsSecured();
      case 'body-propped':
        return m.safety.bodyPropInstalled;
      case 'body-secured':
        return m.loadsSecured();
      case 'engine-off':
        return !m.controls.engineRunning && !m.controls.ptoSwitch;
      case 'loto':
        return m.safety.lotoApplied;
      case 'no-loto':
        return !m.safety.lotoApplied;
      case 'depressurised':
        return this.done.has('zero') && m.isDepressurised();
      case 'lines-disconnected':
        return this.lines.every((l) => m.disconnected.has(l));
      case 'removed':
        return this.procedure.target.kind === 'component' && m.removed.has(this.procedure.target.id);
      case 'part-selected':
        return this.selectedPart !== null;
      case 'installed':
        return this.installed;
      case 'reconnected':
        return this.lines.every((l) => !m.disconnected.has(l));
      case 'engine-running':
        return m.controls.engineRunning;
    }
  }

  blockers(step: ProcedureStep): string[] {
    return step.requires.filter((p) => !this.satisfied(p)).map(preconditionText);
  }

  private finish(step: ProcedureStep, r: StepResult): StepResult {
    if (r.ok) this.done.add(step.id);
    this.log.push({ step: step.id, ok: r.ok, message: r.message, t: this.m.time });
    return r;
  }

  run(stepId: string, opts: { capEnds?: boolean; partId?: string; hoseId?: string; reconnect?: ReconnectChoice[]; acknowledgeSpec?: boolean; litres?: number; grade?: string } = {}): StepResult {
    const step = this.procedure.steps.find((s) => s.id === stepId);
    if (!step) return { ok: false, message: 'Unknown step.' };
    const blockers = this.blockers(step);
    if (blockers.length) return { ok: false, message: `Cannot perform this step yet. Required: ${blockers.join('; ')}.` };
    const m = this.m;
    const t = this.procedure.target;
    switch (step.op) {
      case 'review':
        return this.finish(step, { ok: true, message: 'Procedure and specifications reviewed.', details: specLines(this.profile) });
      case 'park':
        m.setParkingBrake(true);
        m.safety.wheelsChocked = true;
        return this.finish(step, { ok: true, message: 'Parking brake set, wheels chocked.' });
      case 'lower-body': {
        const msg = m.secureLoads();
        return this.finish(step, { ok: m.loadsSecured(), message: msg });
      }
      case 'raise-and-prop': {
        if (m.body) m.body.payload = 0;
        if (!m.controls.engineRunning) m.startEngine();
        m.setParkingBrake(true);
        m.setThrottle(0);
        m.setPtoSwitch(true);
        m.advance(2);
        m.setHoist(1);
        for (let i = 0; i < 80 && m.bodyAngle() < 12; i++) m.advance(0.5);
        m.setHoist(0);
        m.advance(0.5);
        if (m.bodyAngle() < 8) return this.finish(step, { ok: false, message: 'Body could not be raised high enough to install the prop (hydraulic fault?). Use an overhead hoist per your shop procedure.' });
        m.safety.bodyPropInstalled = true;
        m.advance(1);
        return this.finish(step, { ok: true, message: `Body raised to ${m.bodyAngle().toFixed(0)}° and prop installed. Load now carried by the prop.` });
      }
      case 'shutdown':
        m.neutralAll();
        m.setPtoSwitch(false);
        m.stopEngine();
        m.setIgnition(false);
        m.advance(2);
        return this.finish(step, { ok: true, message: 'Controls neutral, PTO off, engine stopped.' });
      case 'relieve-pressure':
        return this.finish(step, { ok: true, message: m.relieveStoredPressure() });
      case 'loto':
        m.setIgnition(false);
        m.safety.lotoApplied = true;
        this.onRecord?.('safety', 'loto', 'Lockout/tagout applied');
        return this.finish(step, { ok: true, message: 'Key removed, isolator locked, personal tag attached.' });
      case 'verify-zero': {
        const g = GAUGES.find((x) => x.id === 'g-250')!;
        const readings = m.def.testPoints.filter((tp) => m.circuit.components.some((c) => c.id === tp.component)).map((tp) => ({ tp, r: readGauge(m, tp.id, g) }));
        const max = Math.max(0, ...readings.map((x) => x.r.value));
        const ok = max < 1 * BAR;
        this.done.add('zero');
        const r = this.finish(step, { ok, message: ok ? 'All test points read 0 bar.' : `Pressure still present (${(max / BAR).toFixed(1)} bar) – relieve it before opening lines.`, details: readings.map((x) => `${x.tp.label}: ${(x.r.value / BAR).toFixed(1)} bar`) });
        if (!ok) this.done.delete('zero');
        return r;
      }
      case 'tag-lines': {
        for (const id of this.lines) {
          const c = m.circuit.connections.find((x) => x.id === id);
          if (c) this.tags[id] = { from: { ...c.from }, to: { ...c.to } };
        }
        return this.finish(step, { ok: true, message: `${this.lines.length} line(s) tagged.`, details: this.lines.map((id) => { const c = m.circuit.connections.find((x) => x.id === id)!; return `${c.label}: ${c.from.component}.${c.from.port} → ${c.to.component}.${c.to.port}`; }) });
      }
      case 'disconnect-lines': {
        const msgs = this.lines.filter((l) => !m.disconnected.has(l)).map((l) => m.disconnect(l, opts.capEnds !== false).message);
        if (opts.capEnds === false) this.onRecord?.('safety', 'uncapped', 'Lines left uncapped');
        return this.finish(step, { ok: true, message: 'Lines disconnected.', details: msgs });
      }
      case 'remove-hardware':
        return this.finish(step, { ok: true, message: 'Mounting hardware removed; component supported.' });
      case 'remove': {
        const r = m.removeComponent(t.id);
        return this.finish(step, { ok: r.ok, message: r.message });
      }
      case 'inspect-removed': {
        const comp = m.removed.get(t.id)!;
        const faults = m.removedFaults.get(t.id) ?? [];
        return this.finish(step, { ok: true, message: 'Removed component inspected.', details: inspectRemoved(comp, faults), bench: benchTest(comp, faults, Math.max(40, m.sim.fluidState.temperature)) });
      }
      case 'select-part': {
        const part = opts.partId ? partById(opts.partId) : null;
        if (!part) return { ok: false, message: 'Choose a part.' };
        const slot = this.profile.slots[t.id];
        const issues = slot ? checkCompatibility(part, slot) : [];
        if (issues.some((i) => i.severity === 'blocking')) return { ok: false, message: 'This part cannot be installed on this equipment.', issues };
        this.selectedPart = part;
        return this.finish(step, { ok: true, message: issues.length ? `${part.name} selected – WARNING: compatibility concerns.` : `${part.name} selected – compatible with this equipment profile.`, issues });
      }
      case 'install': {
        const old = m.removed.get(t.id)!;
        const p = this.selectedPart!;
        const r = m.installComponent({ id: t.id, type: p.componentType, label: old.label, partId: p.id, params: structuredClone(p.params), layout: old.layout });
        // A fresh unit is installed dry: small volume of air enters when the circuit is reconnected.
        m.sim.fluidState.airFraction = Math.min(0.3, m.sim.fluidState.airFraction + 0.012);
        if (r.ok) {
          this.installed = true;
          this.onRecord?.('replace', t.id, `Installed ${p.name}`);
        }
        return this.finish(step, { ok: r.ok, message: r.message });
      }
      case 'torque': {
        const spec = this.profile.specs['torque.orb16'];
        if (!opts.acknowledgeSpec) return { ok: false, message: spec?.status === 'manufacturer-verified' ? 'Confirm the documented torque specification.' : 'No manufacturer-verified torque specification is on file for this equipment. Confirm you have consulted the applicable manufacturer documentation (the training value is NOT a real specification).' };
        if (t.kind === 'connection') m.tightenFitting(t.id);
        this.torqueAcknowledged = true;
        return this.finish(step, { ok: true, message: `Torqued per ${spec?.status === 'manufacturer-verified' ? 'documented specification' : 'manufacturer documentation (confirmed by technician)'}.` });
      }
      case 'reconnect': {
        const choices = opts.reconnect ?? this.lines.map((l) => ({ connection: l, ...(this.tags[l] ?? { from: m.circuit.connections.find((c) => c.id === l)!.from, to: m.circuit.connections.find((c) => c.id === l)!.to }) }));
        const msgs = choices.map((ch) => m.reconnect(ch.connection, ch.from, ch.to).message);
        return this.finish(step, { ok: this.lines.every((l) => !m.disconnected.has(l)), message: 'Lines reconnected.', details: msgs });
      }
      case 'verify-connections': {
        const diffs = compareToReference(m.circuit, { ...m.circuit, connections: this.reference.connections });
        const val = validateCircuit(m.circuit).filter((i) => i.severity === 'danger' || i.severity === 'error');
        const details = [...diffs.map((d) => d.message), ...val.map((v) => `${v.severity.toUpperCase()}: ${v.message} → ${v.fix}`)];
        return this.finish(step, { ok: true, message: details.length ? `${details.length} connection problem(s) found – correct them before restoring the equipment.` : 'All connections match the schematic.', details });
      }
      case 'replace-hose': {
        const c = m.circuit.connections.find((x) => x.id === t.id)!;
        const h = HOSES.find((x) => x.id === opts.hoseId);
        if (!h) return { ok: false, message: 'Choose a hose.' };
        const issues = checkHose(h, c.lineType, c.hose.innerDiameter * 1000, c.lineType === 'suction' ? 0 : Number(m.circuit.components.find((x) => x.type === 'relief-valve')?.params.crackingPressure ?? 0));
        if (issues.some((i) => i.severity === 'blocking')) return { ok: false, message: 'This hose does not fit.', issues };
        m.replaceHose(t.id, { innerDiameter: h.innerDiameterMm / 1000, length: c.hose.length, workingPressure: h.workingPressureBar * BAR, construction: h.construction });
        this.onRecord?.('replace', t.id, `Replaced hose ${t.id} with ${h.name}`);
        return this.finish(step, { ok: true, message: `Hose replaced with ${h.name}.`, issues });
      }
      case 'tighten':
        return this.finish(step, { ...m.tightenFitting(t.id) });
      case 'replace-element':
        m.replaceFilterElement(t.id);
        this.onRecord?.('replace', `${t.id}-element`, 'Filter element replaced');
        return this.finish(step, { ok: true, message: 'Filter element replaced; housing O-ring renewed.' });
      case 'replace-solenoid':
        m.replaceSolenoid(t.id);
        this.onRecord?.('replace', t.id, 'Solenoid coil replaced');
        return this.finish(step, { ok: true, message: 'Solenoid coil replaced.' });
      case 'repair-wiring':
        m.repairWiring(t.id);
        this.onRecord?.('repair', t.id, 'Wiring repaired');
        return this.finish(step, { ok: true, message: 'Connector cleaned/replaced and harness repaired; dielectric grease applied.' });
      case 'repair-pto':
        m.repairPto();
        this.onRecord?.('replace', 'pto', 'PTO repaired');
        return this.finish(step, { ok: true, message: 'PTO repaired (shift mechanism, clutch, gears and output coupling inspected/renewed).' });
      case 'free-spool':
        m.freeSpool(t.id);
        this.onRecord?.('repair', t.id, 'Spool cleaned');
        return this.finish(step, { ok: true, message: 'Spool removed, cleaned and refitted. Root cause (contamination) must still be addressed.' });
      case 'clean-cooler':
        m.cleanCooler(t.id);
        return this.finish(step, { ok: true, message: 'Cooler core cleaned.' });
      case 'top-up':
        m.topUpFluid('tank', opts.litres ?? 20);
        return this.finish(step, { ok: true, message: `Added ${opts.litres ?? 20} L of ${m.circuit.specifiedFluidGrade}.` });
      case 'flush': {
        const g = opts.grade ?? m.circuit.specifiedFluidGrade ?? 'iso-vg-46';
        m.drainAndRefill(g);
        m.replaceFilterElement('filter');
        return this.finish(step, { ok: true, message: `System drained, flushed and refilled with ${g}; filter element replaced.` });
      }
      case 'restore': {
        const level = m.sim.readout('tank', 'belowMin') === 1;
        if (level) m.topUpFluid('tank', 10);
        m.safety.lotoApplied = false;
        m.safety.bodyPropInstalled = m.safety.bodyPropInstalled && m.bodyAngle() > 0.5;
        if (m.safety.bodyPropInstalled) {
          m.safety.bodyPropInstalled = false;
        }
        return this.finish(step, { ok: true, message: `Lockout removed${level ? '; topped up 10 L' : ''}. Body prop stowed.` });
      }
      case 'bleed':
        m.bleedAir();
        return this.finish(step, { ok: true, message: 'Function cycled at idle; air purged.' });
      case 'test':
        return this.finish(step, { ok: true, message: 'Ready for operational verification in the equipment simulator.' });
    }
  }

  stepsDone() {
    return this.done.size;
  }
}

function specLines(p: EquipmentProfile): string[] {
  return Object.entries(p.specs).map(([k, v]) => `${k}: ${v.value}${v.unit ? ' ' + v.unit : ''} [${v.status}]`);
}

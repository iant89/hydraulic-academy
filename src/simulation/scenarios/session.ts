import { hashSeed } from '../core/rng';
import { FAULT_INFO } from '../failures/catalog';
import { MachineSimulation } from '../machine/machine';
import type { MachineDefinition } from '../machine/types';
import { OperationTracker, evaluateCriteria, type CriterionResult } from './tracker';
import type { DiagnosticScenario, ScenarioBrief } from './types';

export type SessionActionType = 'observe' | 'test' | 'hypothesis' | 'confirm' | 'repair' | 'replace' | 'safety' | 'operate' | 'note';

export interface SessionAction {
  t: number;
  type: SessionActionType;
  id: string;
  detail: string;
}

export interface Hypothesis {
  id: string;
  text: string;
  target?: string;
  kind?: string;
  status: 'open' | 'supported' | 'ruled-out';
  createdAt: number;
}

export interface ConfirmedFailure {
  target: string;
  kind: string;
  t: number;
}

/** Events that represent unsafe technician actions. */
export const SAFETY_VIOLATION_CODES = ['opened-under-pressure', 'unsupported-load', 'start-pto-on', 'gauge-overrange', 'unsafe-leak-check', 'skipped-loto', 'unsafe-adjust'];

export function createScenarioMachine(def: MachineDefinition, s: DiagnosticScenario, seed?: number): MachineSimulation {
  const { brief, key } = s;
  const circuit = structuredClone(def.circuit);
  for (const rp of key.setup?.replaceParams ?? []) {
    const c = circuit.components.find((x) => x.id === rp.component);
    if (c) Object.assign(c.params, rp.params);
  }
  if (key.setup?.reservoirVolumeL !== undefined) {
    const r = circuit.components.find((x) => x.type === 'reservoir');
    if (r) r.params.initialVolume = key.setup.reservoirVolumeL;
  }
  for (const rc of key.setup?.reconnect ?? []) {
    const c = circuit.connections.find((x) => x.id === rc.connection);
    if (c) {
      if (rc.from) c.from = rc.from;
      if (rc.to) c.to = rc.to;
    }
  }
  const m = new MachineSimulation(
    { ...def, circuit },
    {
      seed: seed ?? hashSeed(brief.id),
      ambient: brief.conditions.ambient,
      initialTemperature: brief.conditions.initialTemperature,
      payload: brief.conditions.payload,
      faults: structuredClone(key.faults),
      fluid: {
        ...(key.setup?.fluid?.contamination !== undefined ? { contamination: key.setup.fluid.contamination } : {}),
        ...(key.setup?.fluid?.water !== undefined ? { water: key.setup.fluid.water } : {}),
        ...(key.setup?.fluid?.grade ? { grade: key.setup.fluid.grade } : {}),
        ...(key.setup?.fluid?.airFraction !== undefined ? { airFraction: key.setup.fluid.airFraction } : {}),
      },
    },
  );
  return m;
}

export interface ScoreCategory {
  id: string;
  label: string;
  weight: number;
  score: number;
  feedback: string[];
}

export interface ScoreReport {
  total: number;
  passed: boolean;
  categories: ScoreCategory[];
  verification: CriterionResult[];
  unresolvedFaults: number;
  explanation: string;
}

/**
 * A technician's diagnostic session: holds the scenario runtime, records
 * every action and evaluates performance. The hidden key never leaves this
 * object except through `evaluate()` (post-submission feedback).
 */
export class DiagnosticSession {
  readonly machine: MachineSimulation;
  readonly tracker: OperationTracker;
  actions: SessionAction[] = [];
  hypotheses: Hypothesis[] = [];
  confirmed: ConfirmedFailure[] = [];
  replaced: string[] = [];
  repairCompletedAt: number | null = null;
  submitted = false;

  constructor(
    readonly definition: MachineDefinition,
    private scenario: DiagnosticScenario,
    seed?: number,
  ) {
    this.machine = createScenarioMachine(definition, scenario, seed);
    this.tracker = new OperationTracker(this.machine).attach();
  }

  get brief(): ScenarioBrief {
    return this.scenario.brief;
  }

  record(type: SessionActionType, id: string, detail: string) {
    this.actions.push({ t: this.machine.time, type, id, detail });
  }

  addHypothesis(text: string, target?: string, kind?: string): Hypothesis {
    const h: Hypothesis = { id: `h${this.hypotheses.length + 1}`, text, target, kind, status: 'open', createdAt: this.machine.time };
    this.hypotheses.push(h);
    this.record('hypothesis', h.id, text);
    return h;
  }

  setHypothesisStatus(id: string, status: Hypothesis['status']) {
    const h = this.hypotheses.find((x) => x.id === id);
    if (h) h.status = status;
  }

  confirmFailure(target: string, kind: string) {
    if (this.confirmed.some((c) => c.target === target && c.kind === kind)) return;
    this.confirmed.push({ target, kind, t: this.machine.time });
    this.record('confirm', `${target}:${kind}`, `${target} – ${FAULT_INFO.get(kind)?.label ?? kind}`);
  }

  unconfirmFailure(target: string, kind: string) {
    this.confirmed = this.confirmed.filter((c) => !(c.target === target && c.kind === kind));
  }

  recordReplacement(componentId: string) {
    this.replaced.push(componentId);
    this.record('replace', componentId, `Replaced ${componentId}`);
  }

  markRepairComplete() {
    this.repairCompletedAt = this.machine.time;
    this.tracker.reset();
    this.record('repair', 'complete', 'Repair declared complete – verification started.');
  }

  verification(): CriterionResult[] {
    return evaluateCriteria(this.brief.verification, this.tracker.results);
  }

  testsPerformed(): Set<string> {
    return new Set(this.actions.filter((a) => a.type === 'test' || a.type === 'observe').map((a) => a.id));
  }

  evaluate(): ScoreReport {
    const key = this.scenario.key;
    const realFaults = key.faults;
    const cats: ScoreCategory[] = [];

    // 1. Failure identification
    {
      const fb: string[] = [];
      let pts = 0;
      for (const f of realFaults) {
        const exact = this.confirmed.find((c) => c.target === f.target && c.kind === f.kind);
        const group = FAULT_INFO.get(f.kind)?.group;
        const partial = this.confirmed.find((c) => c.target === f.target || (FAULT_INFO.get(c.kind)?.group === group && group !== undefined));
        if (exact) {
          pts += 1;
          fb.push(`Correctly identified: ${FAULT_INFO.get(f.kind)?.label} (${f.target}).`);
        } else if (partial) {
          pts += 0.5;
          fb.push(`Partly identified: the actual failure was ${FAULT_INFO.get(f.kind)?.label} on ${f.target}.`);
        } else fb.push(`Missed: ${FAULT_INFO.get(f.kind)?.label} on ${f.target}.`);
      }
      const falsePos = this.confirmed.filter((c) => !realFaults.some((f) => f.target === c.target && f.kind === c.kind) && !realFaults.some((f) => f.target === c.target));
      falsePos.forEach((c) => fb.push(`Incorrect conclusion: ${FAULT_INFO.get(c.kind)?.label ?? c.kind} on ${c.target} was not a fault.`));
      const base = realFaults.length ? pts / realFaults.length : this.confirmed.length === 0 ? 1 : 0;
      if (!realFaults.length && this.confirmed.length === 0) fb.push('Correct: the equipment had no fault – baseline readings recorded.');
      cats.push({ id: 'identification', label: 'Failure identification', weight: 30, score: Math.max(0, base - 0.2 * falsePos.length), feedback: fb });
    }

    // 2. Test selection & measurement evidence
    {
      const done = this.testsPerformed();
      const fb: string[] = [];
      let met = 0;
      for (const g of key.evidence) {
        const ok = g.anyOf.some((t) => done.has(t) || [...done].some((d) => d.startsWith(t)));
        if (ok) met++;
        fb.push(`${ok ? '✓' : '✗'} ${g.label}`);
      }
      cats.push({ id: 'tests', label: 'Test selection & evidence', weight: 15, score: key.evidence.length ? met / key.evidence.length : 1, feedback: fb });
    }

    // 3. Diagnostic sequence
    {
      const fb: string[] = [];
      let s = 0;
      const firstTest = this.actions.find((a) => a.type === 'test');
      const firstHyp = this.actions.find((a) => a.type === 'hypothesis');
      const firstReplace = this.actions.find((a) => a.type === 'replace');
      const operated = this.actions.some((a) => a.type === 'operate');
      if (operated) {
        s += 1 / 3;
        fb.push('✓ Operated the equipment to reproduce the complaint.');
      } else fb.push('✗ Always operate the equipment to verify the complaint first.');
      if (firstHyp && (!firstTest || firstHyp.t <= firstTest.t)) {
        s += 1 / 3;
        fb.push('✓ Recorded a hypothesis before testing.');
      } else fb.push('✗ Record hypotheses before testing – it keeps the diagnosis structured.');
      if (!firstReplace || (firstTest && firstTest.t < firstReplace.t)) {
        s += 1 / 3;
        fb.push('✓ Tested before replacing parts.');
      } else fb.push('✗ Parts were replaced before any measurement confirmed the cause.');
      cats.push({ id: 'sequence', label: 'Diagnostic sequence', weight: 10, score: s, feedback: fb });
    }

    // 4. Unnecessary replacement
    {
      const fb: string[] = [];
      const faulty = new Set(realFaults.map((f) => f.target));
      const unnecessary = [...new Set(this.replaced)].filter((id) => !faulty.has(id));
      unnecessary.forEach((id) => fb.push(`Unnecessary replacement: ${id} was serviceable.`));
      if (!unnecessary.length) fb.push('No unnecessary parts replaced.');
      cats.push({ id: 'replacement', label: 'Parts replacement discipline', weight: 15, score: Math.max(0, 1 - unnecessary.length / 3), feedback: fb });
    }

    // 5. Unnecessary tests
    {
      const relevant = key.evidence.flatMap((g) => g.anyOf);
      const tests = this.actions.filter((a) => a.type === 'test');
      const extra = tests.filter((t) => !relevant.some((r) => t.id.startsWith(r)));
      const uniqueExtra = new Set(extra.map((e) => e.id)).size;
      const s = Math.max(0, 1 - Math.max(0, uniqueExtra - 6) / 10);
      cats.push({ id: 'efficiency', label: 'Test efficiency', weight: 5, score: s, feedback: [`${tests.length} test actions, ${uniqueExtra} not directly relevant.`] });
    }

    // 6. Safety
    {
      const violations = this.machine.events.filter((e) => SAFETY_VIOLATION_CODES.includes(e.code));
      const fb = violations.map((v) => `Safety: ${v.message}`);
      if (!violations.length) fb.push('No safety violations recorded.');
      cats.push({ id: 'safety', label: 'Safety compliance', weight: 15, score: Math.max(0, 1 - violations.length * 0.34), feedback: fb });
    }

    // 7. Repair verification
    const verification = this.verification();
    const unresolved = this.machine.faults.outstanding().filter((f) => !f.spec.induced || f.active).length;
    {
      const fb: string[] = [];
      const met = verification.filter((v) => v.met).length;
      verification.forEach((v) => fb.push(`${v.met ? '✓' : '✗'} ${v.criterion.label}: ${v.detail}`));
      if (this.repairCompletedAt === null) fb.push('Repair was never declared complete – post-repair verification not performed.');
      if (unresolved) fb.push(`${unresolved} fault condition(s) remain in the equipment.`);
      const s = this.repairCompletedAt === null ? 0 : (met / Math.max(1, verification.length)) * (unresolved ? 0.5 : 1);
      cats.push({ id: 'verification', label: 'Repair verification', weight: 10, score: s, feedback: fb });
    }

    const total = cats.reduce((a, c) => a + c.weight * c.score, 0);
    const safety = cats.find((c) => c.id === 'safety')!;
    return {
      total: Math.round(total),
      passed: total >= 75 && safety.score >= 0.66 && unresolved === 0,
      categories: cats,
      verification,
      unresolvedFaults: unresolved,
      explanation: key.explanation,
    };
  }
}

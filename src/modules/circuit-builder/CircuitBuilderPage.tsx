import { useState } from 'react';
import { CheckCircle2, Workflow } from 'lucide-react';
import { EXERCISES } from '@/data/exercises';
import { CircuitEditor } from '@/components/circuit/CircuitEditor';
import { compareNets, validateCircuit } from '@/simulation/circuits/validation';
import { HydraulicSimulation } from '@/simulation/hydraulics/simulation';
import type { CircuitDefinition } from '@/simulation/hydraulics/types';
import { useTraining } from '@/stores/training';
import { newId } from '@/services/training/records';
import { Badge, Button, Callout, Panel } from '@/components/ui';
import p from '../shared/page.module.css';

export default function CircuitBuilderPage() {
  const [id, setId] = useState(EXERCISES[0]!.id);
  const ex = EXERCISES.find((e) => e.id === id)!;
  const [circuit, setCircuit] = useState<CircuitDefinition>(ex.start());
  const [result, setResult] = useState<null | { ok: boolean; lines: string[]; run?: string }>(null);
  const [highlight, setHighlight] = useState<{ ports: Set<string>; connections: Set<string> }>({ ports: new Set(), connections: new Set() });
  const { progress, updateProgress, addRecord } = useTraining();

  const check = async () => {
    const ref: CircuitDefinition = { ...ex.start(), connections: ex.reference() };
    const diffs = compareNets(circuit, ref);
    const issues = validateCircuit(circuit).filter((i) => i.severity === 'danger' || i.severity === 'error');
    const lines = [...issues.map((i) => `${i.severity.toUpperCase()}: ${i.message} – ${i.consequence} Fix: ${i.fix}`), ...diffs.map((d) => d.message)];
    let run: string | undefined;
    const ok = diffs.length === 0 && issues.length === 0;
    setHighlight({ ports: new Set(diffs.flatMap((d) => d.ports)), connections: new Set(issues.flatMap((i) => i.connections)) });
    if (ok && ex.check) {
      // Operational proof on the simulation engine.
      const sim = new HydraulicSimulation(structuredClone(circuit), { seed: 1 });
      sim.run(0.5);
      sim.setInput(ex.check.component, ex.check.input, ex.check.value);
      sim.run(1.5);
      const v = sim.readout(ex.check.expect.component, ex.check.expect.key);
      run = Math.abs(v) >= Math.abs(ex.check.expect.min) ? `Operational test passed (${ex.check.expect.key} = ${v.toFixed(3)}).` : `Operational test FAILED: ${ex.check.expect.key} = ${v.toFixed(3)}.`;
    }
    setResult({ ok, lines, run });
    if (ok && !progress.completedExercises.includes(id)) {
      await updateProgress((pr) => ({ ...pr, completedExercises: [...pr.completedExercises, id] }));
      await addRecord({ id: newId('cb'), type: 'exercise', refId: id, title: ex.title, date: new Date().toISOString(), score: 100, passed: true });
    } else if (!ok) {
      await addRecord({ id: newId('cb'), type: 'exercise', refId: id, title: ex.title, date: new Date().toISOString(), score: 0, passed: false, mistakes: lines.slice(0, 5) });
    }
  };

  return (
    <div className={p.page}>
      <div className={p.head}>
        <div className={p.grow}>
          <h1>Circuit Builder</h1>
          <p>Connect real ports to build working circuits. Validation is based on port markings and function – never on hose colour. Every circuit you build runs on the same simulation engine as the equipment.</p>
        </div>
      </div>
      <div className={p.splitL}>
        <Panel title="Exercises">
          <div className={p.list}>
            {EXERCISES.map((e) => (
              <button key={e.id} className={`${p.item} ${e.id === id ? p.itemActive : ''}`} onClick={() => { setId(e.id); setCircuit(e.start()); setResult(null); setHighlight({ ports: new Set(), connections: new Set() }); }}>
                <div className={p.itemTitle}>
                  <Workflow size={13} /> {e.title} {progress.completedExercises.includes(e.id) && <CheckCircle2 size={13} color="var(--ok)" />}
                </div>
              </button>
            ))}
          </div>
        </Panel>
        <div className={p.stack}>
          <Panel title={ex.title} actions={<Button variant="primary" onClick={check}>Check connections</Button>}>
            <p style={{ color: 'var(--text-2)' }}>{ex.brief}</p>
            <div className={p.row}>
              {ex.goals.map((g) => (
                <Badge key={g}>{g}</Badge>
              ))}
            </div>
            <div style={{ marginTop: 6 }} className={p.small}>
              Hint: {ex.hint}
            </div>
          </Panel>
          {result && (
            <Callout tone={result.ok ? 'ok' : 'warn'} title={result.ok ? 'Circuit correct' : `${result.lines.length} problem(s) found`}>
              {result.lines.map((l, i) => (
                <div key={i}>• {l}</div>
              ))}
              {result.run && <div>{result.run}</div>}
            </Callout>
          )}
          <CircuitEditor key={id} initial={ex.start()} allowComponents={false} onChange={setCircuit} highlight={highlight} height={480} />
        </div>
      </div>
    </div>
  );
}

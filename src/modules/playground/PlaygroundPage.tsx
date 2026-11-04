import { useEffect, useState } from 'react';
import { Save, TestTubes, Trash2 } from 'lucide-react';
import { EXPERIMENTS } from '@/data/labs';
import { CircuitLab, type LabRecord } from '@/components/circuit/CircuitLab';
import { CircuitEditor } from '@/components/circuit/CircuitEditor';
import { basicCylinderCircuit } from '@/simulation/circuits/library';
import type { CircuitDefinition } from '@/simulation/hydraulics/types';
import { experimentsRepo, type PlaygroundExperiment } from '@/services/training/experiments';
import { newId } from '@/services/training/records';
import { useTraining } from '@/stores/training';
import { Badge, Button, Callout, Field, Panel, Select, Tabs, TextArea, TextInput, tableClass } from '@/components/ui';
import p from '../shared/page.module.css';

type Tab = 'experiments' | 'free' | 'saved';

const blank = (): CircuitDefinition => ({
  id: 'free',
  name: 'Free build',
  fluidGrade: 'iso-vg-46',
  components: [
    { id: 'tank', type: 'reservoir', label: 'Reservoir', params: { capacity: 80, initialVolume: 60, height: 0.4 }, layout: { x: 1, y: 10 } },
    { id: 'pump', type: 'pump-gear', label: 'Gear pump', params: { displacement: 16, speed: 1500, ratedSpeed: 2500 }, layout: { x: 1.5, y: 6 } },
  ],
  connections: [],
});

export default function PlaygroundPage() {
  const [tab, setTab] = useState<Tab>('experiments');
  const [saved, setSaved] = useState<PlaygroundExperiment[]>([]);
  const refresh = () => void experimentsRepo.list().then(setSaved);
  useEffect(refresh, []);
  return (
    <div className={p.page}>
      <div className={p.head}>
        <div className={p.grow}>
          <h1>Hydraulic Playground</h1>
          <p>Unrestricted experimentation on the same simulation engine and component library used by the equipment. Build circuits, change parameters, inject failures, record measurements and compare configurations.</p>
        </div>
      </div>
      <Tabs<Tab> tabs={[{ id: 'experiments', label: 'Prebuilt experiments' }, { id: 'free', label: 'Free build' }, { id: 'saved', label: `Saved & compare (${saved.length})` }]} value={tab} onChange={setTab} />
      {tab === 'experiments' && <Experiments onSaved={refresh} />}
      {tab === 'free' && <FreeBuild onSaved={refresh} />}
      {tab === 'saved' && <Saved items={saved} onChange={refresh} />}
    </div>
  );
}

function SaveBox({ circuit, measurements, experimentId, onSaved }: { circuit: CircuitDefinition; measurements: LabRecord[]; experimentId: string | null; onSaved(): void }) {
  const [name, setName] = useState('');
  const [obs, setObs] = useState('');
  const [concl, setConcl] = useState('');
  const [ok, setOk] = useState(false);
  const update = useTraining((s) => s.updateProgress);
  return (
    <Panel title="Observations & conclusion">
      <div className={p.list}>
        <Field label="Experiment name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Orifice 4 mm vs 2 mm" />
        </Field>
        <Field label="Observations">
          <TextArea value={obs} onChange={(e) => setObs(e.target.value)} />
        </Field>
        <Field label="Conclusion">
          <TextArea value={concl} onChange={(e) => setConcl(e.target.value)} />
        </Field>
        <Button
          variant="primary"
          disabled={!name.trim()}
          onClick={async () => {
            await experimentsRepo.save({ id: newId('exp'), name: name.trim(), experimentId, date: new Date().toISOString(), circuit, measurements, observations: obs, conclusions: concl });
            if (experimentId && concl.trim()) await update((pr) => ({ ...pr, completedExperiments: [...new Set([...pr.completedExperiments, experimentId])] }));
            setOk(true);
            onSaved();
          }}
        >
          <Save size={14} /> Save experiment
        </Button>
        {ok && <Callout tone="ok">Saved to this device. Compare it in “Saved & compare”.</Callout>}
      </div>
    </Panel>
  );
}

function Experiments({ onSaved }: { onSaved(): void }) {
  const [id, setId] = useState(EXPERIMENTS[0]!.id);
  const [records, setRecords] = useState<LabRecord[]>([]);
  const [reveal, setReveal] = useState(false);
  const progress = useTraining((s) => s.progress);
  const e = EXPERIMENTS.find((x) => x.id === id)!;
  return (
    <div className={p.splitL}>
      <Panel title="Experiments">
        <div className={p.list}>
          {[...EXPERIMENTS.slice(0, 6), null, ...EXPERIMENTS.slice(6)].map((x, i) =>
            x ? (
              <button key={x.id} className={`${p.item} ${x.id === id ? p.itemActive : ''}`} onClick={() => { setId(x.id); setRecords([]); setReveal(false); }}>
                <div className={p.itemTitle}>
                  <TestTubes size={13} /> {i + 1}. {x.title} {progress.completedExperiments.includes(x.id) && <Badge tone="ok">done</Badge>}
                </div>
              </button>
            ) : (
              <button key="build" className={`${p.item} ${id === '__build' ? p.itemActive : ''}`} onClick={() => setId('__build')} style={{ borderStyle: 'dashed' }}>
                <div className={p.itemTitle}>
                  <TestTubes size={13} /> 7. Basic hydraulic circuit construction
                </div>
              </button>
            ),
          )}
        </div>
      </Panel>
      {id === '__build' ? (
        <Panel title="Basic hydraulic circuit construction">
          <p>Use the <strong>Free build</strong> tab to place a pump, relief, valve and actuator and connect them, or work through the guided exercises in the Circuit Builder.</p>
        </Panel>
      ) : (
        <div className={p.stack}>
          <Panel title={e.title}>
            <p style={{ color: 'var(--text-2)' }}>
              <strong>Learning objective:</strong> {e.objective}
            </p>
            <CircuitLab key={e.id} circuit={e.circuit()} controls={e.controls} readouts={e.readouts} onRecord={(r) => setRecords([r, ...records])} />
          </Panel>
          <div className={p.cols2}>
            <Panel title="Procedure & expected observations">
              <ol style={{ margin: 0, paddingLeft: 18, color: 'var(--text-2)' }}>
                {e.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              <div style={{ marginTop: 8 }}>
                {reveal ? (
                  <Callout tone="ok" title="Expected">
                    {e.expected.map((x) => (
                      <div key={x}>• {x}</div>
                    ))}
                    <div style={{ marginTop: 4 }}>{e.explanation}</div>
                  </Callout>
                ) : (
                  <Button size="sm" onClick={() => setReveal(true)}>
                    Compare with expected observations
                  </Button>
                )}
              </div>
            </Panel>
            <Panel title={`Actual simulation results (${records.length})`}>
              <div className={p.scroll}>
                <table className={tableClass}>
                  <tbody>
                    {records.map((r, i) => (
                      <tr key={i}>
                        <td className={p.small}>{Object.entries(r.settings).map(([k, v]) => `${k}: ${v}`).join(' · ')}</td>
                        <td className={p.mono}>{Object.entries(r.values).map(([k, v]) => `${k}: ${v}`).join(' · ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!records.length && <div className={p.small}>Press “Record measurement” after each change.</div>}
              </div>
            </Panel>
          </div>
          <SaveBox circuit={e.circuit()} measurements={records} experimentId={e.id} onSaved={onSaved} />
        </div>
      )}
    </div>
  );
}

function FreeBuild({ onSaved }: { onSaved(): void }) {
  const [start, setStart] = useState<'blank' | 'basic'>('basic');
  const [circuit, setCircuit] = useState<CircuitDefinition>(basicCylinderCircuit());
  return (
    <div className={p.stack}>
      <div className={p.row}>
        <span className={p.small}>Start from</span>
        <Button size="sm" active={start === 'basic'} onClick={() => { setStart('basic'); setCircuit(basicCylinderCircuit()); }}>
          Basic cylinder circuit
        </Button>
        <Button size="sm" active={start === 'blank'} onClick={() => { setStart('blank'); setCircuit(blank()); }}>
          Reservoir and pump only
        </Button>
      </div>
      <CircuitEditor key={start} initial={start === 'basic' ? basicCylinderCircuit() : blank()} onChange={setCircuit} />
      <SaveBox circuit={circuit} measurements={[]} experimentId={null} onSaved={onSaved} />
    </div>
  );
}

function Saved({ items, onChange }: { items: PlaygroundExperiment[]; onChange(): void }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const A = items.find((x) => x.id === a);
  const B = items.find((x) => x.id === b);
  const opts = [{ value: '', label: 'Select…' }, ...items.map((x) => ({ value: x.id, label: `${x.name} (${new Date(x.date).toLocaleString()})` }))];
  const paramDiff = (x?: PlaygroundExperiment, y?: PlaygroundExperiment) => {
    if (!x || !y) return [];
    const out: string[] = [];
    for (const c of x.circuit.components) {
      const d = y.circuit.components.find((k) => k.id === c.id);
      if (!d) {
        out.push(`${c.label}: only in A`);
        continue;
      }
      for (const [k, v] of Object.entries(c.params)) if (JSON.stringify(v) !== JSON.stringify(d.params[k])) out.push(`${c.label}.${k}: ${JSON.stringify(v)} → ${JSON.stringify(d.params[k])}`);
    }
    if (x.circuit.connections.length !== y.circuit.connections.length) out.push(`Connections: ${x.circuit.connections.length} → ${y.circuit.connections.length}`);
    return out;
  };
  return (
    <div className={p.stack}>
      <Panel title="Saved experiments">
        {items.length === 0 ? (
          <div className={p.small}>No saved experiments yet.</div>
        ) : (
          <table className={tableClass}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Date</th>
                <th>Measurements</th>
                <th>Conclusion</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((x) => (
                <tr key={x.id}>
                  <td>{x.name}</td>
                  <td className={p.small}>{new Date(x.date).toLocaleString()}</td>
                  <td>{x.measurements.length}</td>
                  <td className={p.small}>{x.conclusions || '—'}</td>
                  <td>
                    <Button size="sm" variant="ghost" onClick={async () => { await experimentsRepo.remove(x.id); onChange(); }} aria-label={`Delete ${x.name}`}>
                      <Trash2 size={13} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      <Panel title="Compare two experiments">
        <div className={p.cols2}>
          <Field label="Experiment A">
            <Select value={a} onChange={(e) => setA(e.target.value)} options={opts} />
          </Field>
          <Field label="Experiment B">
            <Select value={b} onChange={(e) => setB(e.target.value)} options={opts} />
          </Field>
        </div>
        {A && B && (
          <div className={p.stack} style={{ marginTop: 10 }}>
            <Callout title="Configuration differences">{paramDiff(A, B).map((d) => <div key={d}>• {d}</div>)}{!paramDiff(A, B).length && 'Identical circuits.'}</Callout>
            <div className={p.cols2}>
              {[A, B].map((x, i) => (
                <div key={i}>
                  <h3>{i ? 'B' : 'A'}: {x.name}</h3>
                  <table className={tableClass}>
                    <tbody>
                      {x.measurements.map((r, k) => (
                        <tr key={k}>
                          <td className={p.small}>{Object.values(r.settings).join(' · ')}</td>
                          <td className={p.mono}>{Object.entries(r.values).map(([kk, v]) => `${kk}: ${v}`).join(' · ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className={p.small}>{x.observations}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

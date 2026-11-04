import { useMemo, useState } from 'react';
import { CheckCircle2, CircleDashed, ClipboardList, FlaskConical, Lightbulb, Truck, Wrench, XCircle } from 'lucide-react';
import { useWorkbay } from '@/stores/workbay';
import { useTick } from '@/stores/simLoop';
import { useTraining } from '@/stores/training';
import { usePrefs } from '@/stores/prefs';
import { inspectionFor } from '@/equipment/registry';
import { FAULT_KINDS, FAULT_INFO } from '@/simulation/failures/catalog';
import type { ScoreReport } from '@/simulation/scenarios/session';
import { newId } from '@/services/training/records';
import { href } from '@/app/router';
import { DumpTruck3D } from '@/visualization/equipment/DumpTruck3D';
import { Schematic } from '@/visualization/schematics/Schematic';
import { OperatorControls } from '@/components/equipment/OperatorControls';
import { InstrumentsPanel } from '@/components/equipment/InstrumentsPanel';
import { InspectionPanel } from '@/components/equipment/InspectionPanel';
import { EventLog, StatusPanel } from '@/components/equipment/StatusPanel';
import { TimeControls } from '@/components/equipment/TimeControls';
import { Badge, Button, Callout, Field, Meter, Panel, Select, Tabs, TextArea, TextInput, tableClass } from '@/components/ui';
import p from '../shared/page.module.css';

type Tab = 'operate' | 'test' | 'analyse' | 'verify';

export function Workspace() {
  const tick = useTick();
  const st = useWorkbay();
  const session = st.session!;
  const m = st.machine;
  const showHints = usePrefs((s) => s.showHints);
  const [tab, setTab] = useState<Tab>('operate');
  const [point, setPoint] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [hypText, setHypText] = useState('');
  const [hypTarget, setHypTarget] = useState('');
  const [cTarget, setCTarget] = useState('');
  const [cKind, setCKind] = useState('');
  const [report, setReport] = useState<ScoreReport | null>(null);
  const addRecord = useTraining((s) => s.addRecord);
  const b = session.brief;
  const points = inspectionFor(st.profile);
  const visited = new Set(session.actions.filter((a) => a.type === 'observe').map((a) => a.id.replace('inspect:', '')));

  const targets = useMemo(() => {
    const t: { value: string; label: string; kind: string; type?: string }[] = [{ value: '', label: 'Select item…', kind: '' }];
    for (const c of m.def.circuit.components) t.push({ value: c.id, label: c.label, kind: 'component', type: c.type });
    for (const c of m.def.circuit.connections) t.push({ value: c.id, label: c.label ?? c.id, kind: 'connection' });
    t.push({ value: 'pto', label: 'PTO assembly', kind: 'pto' });
    for (const e of m.def.electrical) t.push({ value: e.id, label: e.label, kind: 'electrical' });
    t.push({ value: 'fluid', label: 'Hydraulic fluid', kind: 'fluid' });
    t.push({ value: 'tank', label: 'Reservoir fluid level', kind: 'reservoir' });
    return t;
  }, [m.def]);
  const ct = targets.find((x) => x.value === cTarget);
  const kinds = FAULT_KINDS.filter((k) => ct && (k.target === ct.kind || (ct.value === 'tank' && k.kind === 'low-fluid')) && (!k.appliesTo || (ct.type && k.appliesTo.includes(ct.type))));

  const verification = session.verification();
  const submit = async () => {
    const r = session.evaluate();
    session.submitted = true;
    setReport(r);
    await addRecord({
      id: newId('scn'),
      type: 'scenario',
      refId: b.id,
      title: b.title,
      date: new Date().toISOString(),
      score: r.total,
      passed: r.passed,
      durationS: m.time,
      mode: b.mode,
      categories: r.categories.map((c) => ({ id: c.id, label: c.label, score: c.score, weight: c.weight })),
      mistakes: r.categories.flatMap((c) => c.feedback.filter((f) => f.startsWith('✗') || f.startsWith('Missed') || f.startsWith('Incorrect') || f.startsWith('Unnecessary') || f.startsWith('Safety'))),
      notes,
    });
  };

  if (report) return <Report report={report} onClose={() => st.endScenario()} />;

  return (
    <div className={p.page}>
      <div className={p.head}>
        <div className={p.grow}>
          <div className={p.row}>
            <h1>{b.title}</h1>
            <Badge tone="accent">{b.mode}</Badge>
            <Badge>{'●'.repeat(b.difficulty)}</Badge>
          </div>
          <p>
            <strong style={{ color: 'var(--text)' }}>{b.customer}:</strong> “{b.complaint}”
          </p>
        </div>
        <TimeControls />
        <Button onClick={() => st.endScenario()}>Abandon</Button>
        <Button variant="primary" onClick={submit}>
          Submit diagnosis & repair
        </Button>
      </div>
      <div className={p.cols3}>
        <Panel title="Work order" icon={<ClipboardList size={14} />}>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-2)' }}>
            {b.history.map((h) => (
              <li key={h}>{h}</li>
            ))}
            <li>Payload {b.conditions.payload} kg · ambient {b.conditions.ambient} °C · oil {b.conditions.initialTemperature} °C at start</li>
          </ul>
          {(b.mode === 'guided' || (showHints && b.mode === 'practical')) && b.hints && (
            <div style={{ marginTop: 8 }}>
              <Callout title="Hints">
                {b.hints.map((h) => (
                  <div key={h}>• {h}</div>
                ))}
              </Callout>
            </div>
          )}
        </Panel>
        <Panel title="Inspection checklist">
          <div className={`${p.list} ${p.scroll}`}>
            {points.map((ip) => (
              <button key={ip.id} className={`${p.item} ${point === ip.id ? p.itemActive : ''}`} onClick={() => { setPoint(ip.id); setTab('operate'); }}>
                <div className={p.itemTitle}>
                  {visited.has(ip.id) ? <CheckCircle2 size={13} color="var(--ok)" /> : <CircleDashed size={13} color="var(--muted)" />} {ip.label}
                  <span className={p.small}>· {ip.zone}</span>
                </div>
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="Verification after repair">
          <div className={p.list}>
            {verification.map((v) => (
              <div key={v.criterion.label} style={{ display: 'flex', gap: 6, fontSize: 13 }}>
                {v.met ? <CheckCircle2 size={15} color="var(--ok)" /> : <XCircle size={15} color="var(--muted)" />}
                <div>
                  <div>{v.criterion.label}</div>
                  <div className={p.small}>{session.repairCompletedAt === null ? 'Declare the repair complete to start verification.' : v.detail}</div>
                </div>
              </div>
            ))}
            <div className={p.row}>
              <a href={href('repair')}>
                <Button size="sm">
                  <Wrench size={13} /> Repair workshop
                </Button>
              </a>
              <Button size="sm" variant={session.repairCompletedAt === null ? 'primary' : undefined} onClick={() => { session.markRepairComplete(); st.bump(); }}>
                {session.repairCompletedAt === null ? 'Declare repair complete' : 'Restart verification'}
              </Button>
            </div>
          </div>
        </Panel>
      </div>
      <Tabs<Tab>
        tabs={[
          { id: 'operate', label: 'Operate & inspect' },
          { id: 'test', label: 'Test & measure' },
          { id: 'analyse', label: 'Hypotheses & conclusions' },
          { id: 'verify', label: 'Schematic & history' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'operate' && (
        <div className={p.split}>
          <div className={p.stack}>
            <div className={p.viewport}>
              <DumpTruck3D getMachine={() => useWorkbay.getState().machine} points={points} selectedPoint={point} onSelectPoint={setPoint} mode="normal" />
            </div>
            <InspectionPanel pointId={point} onClose={() => setPoint(null)} />
          </div>
          <div className={p.stack}>
            <OperatorControls />
            <StatusPanel />
          </div>
        </div>
      )}
      {tab === 'test' && (
        <div className={p.split}>
          <div className={p.stack}>
            <InstrumentsPanel />
          </div>
          <div className={p.stack}>
            <OperatorControls />
            <Panel title="Measurement history">
              <div className={p.scrollTall}>
                <table className={tableClass}>
                  <thead>
                    <tr>
                      <th>t</th>
                      <th>Tool / point</th>
                      <th>Reading</th>
                    </tr>
                  </thead>
                  <tbody>
                    {st.measurements.map((x, i) => (
                      <tr key={i}>
                        <td className={p.mono}>{x.t.toFixed(0)} s</td>
                        <td>
                          {x.tool}
                          <div className={p.small}>{x.point}</div>
                        </td>
                        <td className={p.mono}>{x.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!st.measurements.length && <div className={p.small}>Recorded readings appear here.</div>}
              </div>
            </Panel>
          </div>
        </div>
      )}
      {tab === 'analyse' && (
        <div className={p.cols2}>
          <Panel title="Hypotheses" icon={<Lightbulb size={14} />}>
            <div className={p.list}>
              <div className={p.small}>Record what you suspect BEFORE testing – then test to support or rule out each one.</div>
              <TextInput placeholder="e.g. Relief valve opening early" value={hypText} onChange={(e) => setHypText(e.target.value)} />
              <Select value={hypTarget} onChange={(e) => setHypTarget(e.target.value)} options={targets.map((t) => ({ value: t.value, label: t.value ? t.label : 'Related item (optional)' }))} />
              <Button
                size="sm"
                disabled={!hypText.trim()}
                onClick={() => {
                  session.addHypothesis(hypText.trim(), hypTarget || undefined);
                  setHypText('');
                  st.bump();
                }}
              >
                Add hypothesis
              </Button>
              {session.hypotheses.map((h) => (
                <div key={h.id} className={p.item} style={{ cursor: 'default' }}>
                  <div className={p.itemTitle}>
                    {h.text} <Badge tone={h.status === 'supported' ? 'ok' : h.status === 'ruled-out' ? 'danger' : undefined}>{h.status}</Badge>
                  </div>
                  <div className={p.row} style={{ marginTop: 4 }}>
                    {(['open', 'supported', 'ruled-out'] as const).map((s) => (
                      <Button key={s} size="sm" active={h.status === s} onClick={() => { session.setHypothesisStatus(h.id, s); st.bump(); }}>
                        {s}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Confirmed failures" icon={<FlaskConical size={14} />}>
            <div className={p.list}>
              <div className={p.small}>Declare each failure you have confirmed with evidence. There may be more than one.</div>
              <Field label="Item">
                <Select value={cTarget} onChange={(e) => { setCTarget(e.target.value); setCKind(''); }} options={targets} />
              </Field>
              <Field label="Failure mode">
                <Select value={cKind} onChange={(e) => setCKind(e.target.value)} options={[{ value: '', label: kinds.length ? 'Select failure mode…' : '—' }, ...kinds.map((k) => ({ value: k.kind, label: k.label }))]} />
              </Field>
              <Button size="sm" variant="primary" disabled={!cTarget || !cKind} onClick={() => { session.confirmFailure(cTarget, cKind); st.bump(); }}>
                Confirm failure
              </Button>
              {session.confirmed.map((c) => (
                <div key={`${c.target}:${c.kind}`} className={p.row}>
                  <Badge tone="accent">{targets.find((t) => t.value === c.target)?.label ?? c.target}</Badge>
                  <span>{FAULT_INFO.get(c.kind)?.label}</span>
                  <Button size="sm" variant="ghost" onClick={() => { session.unconfirmFailure(c.target, c.kind); st.bump(); }}>
                    remove
                  </Button>
                </div>
              ))}
              <Field label="Observation notes">
                <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What did you see, hear and measure?" />
              </Field>
            </div>
          </Panel>
        </div>
      )}
      {tab === 'verify' && (
        <div className={p.split}>
          <div className={p.stack}>
            <div className={p.viewport}>
              <Schematic circuit={m.sim.def} sim={m.sim} tick={tick} testPoints={m.def.testPoints} />
            </div>
            <EventLog />
          </div>
          <Panel title="Session actions">
            <div className={p.scrollTall}>
              {[...session.actions].reverse().map((a, i) => (
                <div key={i} style={{ fontSize: 12, padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
                  <span className={p.mono}>{a.t.toFixed(0)} s</span> <Badge>{a.type}</Badge> {a.detail}
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}
      <Panel title="Tip">
        <div className={p.small}>
          <Truck size={12} /> The same equipment is live in the <a href={href('simulator')}>Equipment Simulator</a>, <a href={href('workshop')}>Virtual Workshop</a> and <a href={href('repair')}>Repair Workshop</a>; actions there are recorded in this session.
        </div>
      </Panel>
    </div>
  );
}

function Report({ report, onClose }: { report: ScoreReport; onClose(): void }) {
  return (
    <div className={p.page}>
      <div className={p.head}>
        <div className={p.grow}>
          <h1>Diagnostic report</h1>
          <p>Score {report.total} / 100 · {report.passed ? 'PASSED' : 'NOT PASSED'} · {report.unresolvedFaults ? `${report.unresolvedFaults} fault(s) remain in the equipment` : 'all faults resolved'}</p>
        </div>
        <Button variant="primary" onClick={onClose}>
          Close scenario
        </Button>
      </div>
      <div className={p.cols2}>
        {report.categories.map((c) => (
          <Panel key={c.id} title={c.label} actions={<Badge tone={c.score >= 0.8 ? 'ok' : c.score >= 0.5 ? 'warn' : 'danger'}>{Math.round(c.score * 100)} %</Badge>}>
            <Meter value={c.score} color={c.score >= 0.8 ? 'var(--ok)' : c.score >= 0.5 ? 'var(--warn)' : 'var(--danger)'} />
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--text-2)' }}>
              {c.feedback.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </Panel>
        ))}
      </div>
      <Callout tone="ok" title="What was actually wrong">
        {report.explanation}
      </Callout>
    </div>
  );
}

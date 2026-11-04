import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Circle, Lock, Play, Wrench } from 'lucide-react';
import type { Route } from '@/app/router';
import { href } from '@/app/router';
import { useWorkbay } from '@/stores/workbay';
import { useJobs } from '@/stores/jobs';
import { useTick } from '@/stores/simLoop';
import { WorkshopJob, hoseProcedure, replacementProcedure, simpleProcedure, type Procedure, type ReconnectChoice, type StepResult } from '@/workshop/procedures';
import { machineFromProfile } from '@/equipment/registry';
import { partsForType, HOSES } from '@/data/parts/catalog';
import { getModel } from '@/simulation/components/registry';
import { FLUID_GRADES } from '@/simulation/physics/fluid';
import { Badge, Button, Callout, Field, Panel, Select, Tabs, tableClass } from '@/components/ui';
import { SafetyStatus } from '@/components/equipment/SafetyStatus';
import { ValveAdjustment } from './ValveAdjustment';
import p from '../shared/page.module.css';

export default function RepairPage({ route }: { route: Route }) {
  const [tab, setTab] = useState<'jobs' | 'adjust'>(route.query.get('tab') === 'adjust' ? 'adjust' : 'jobs');
  return (
    <div className={p.page}>
      <div className={p.head}>
        <div className={p.grow}>
          <h1>Repair Workshop</h1>
          <p>Perform equipment-specific service procedures on the live equipment. Safety prerequisites are enforced, part compatibility is validated against the equipment profile, and every action changes the simulation – verify the repair by operating the equipment afterwards.</p>
        </div>
      </div>
      <Tabs<'jobs' | 'adjust'> tabs={[{ id: 'jobs', label: 'Service & repair procedures' }, { id: 'adjust', label: 'Valve adjustment training' }]} value={tab} onChange={setTab} />
      {tab === 'jobs' ? <Jobs route={route} /> : <ValveAdjustment />}
    </div>
  );
}

function proceduresFor(m: ReturnType<typeof useWorkbay.getState>['machine']): { group: string; procs: () => Procedure[]; label: string; key: string }[] {
  const out: { group: string; procs: () => Procedure[]; label: string; key: string }[] = [];
  const crane = m.crane !== null;
  const comps = [...m.circuit.components.filter((c) => c.type !== 'open-port' && c.type !== 'flow-meter'), ...m.removed.values()];
  for (const c of comps) {
    out.push({
      group: 'Components',
      key: `component:${c.id}`,
      label: c.label,
      procs: () => [
        replacementProcedure(m, c.id),
        ...(c.type === 'filter' ? [simpleProcedure('filter', c.id, c.label, crane)] : []),
        ...(c.type === 'dcv' ? [simpleProcedure('spool', c.id, c.label, crane)] : []),
        ...(c.type === 'cooler' ? [simpleProcedure('cooler', c.id, c.label, crane)] : []),
      ],
    });
  }
  for (const c of m.circuit.connections.filter((x) => !x.id.startsWith('ft-'))) out.push({ group: 'Hoses & fittings', key: `connection:${c.id}`, label: c.label ?? c.id, procs: () => [hoseProcedure(m, c.id), simpleProcedure('fitting', c.id, c.label ?? c.id, crane)] });
  for (const e of m.def.electrical) out.push({ group: 'Electrical', key: `electrical:${e.id}`, label: e.label, procs: () => [simpleProcedure('solenoid', e.id, e.label, crane), simpleProcedure('wiring', e.id, `${e.label} wiring`, crane)] });
  out.push({ group: 'Drivetrain', key: 'pto:pto', label: m.def.pto.label, procs: () => [simpleProcedure('pto', 'pto', m.def.pto.label, crane)] });
  out.push({ group: 'Fluid', key: 'fluid:fluid', label: 'Hydraulic fluid', procs: () => [simpleProcedure('top-up', 'fluid', 'Reservoir', crane), simpleProcedure('flush', 'fluid', 'Complete system', crane)] });
  return out;
}

function Jobs({ route }: { route: Route }) {
  useTick();
  const st = useWorkbay();
  const m = st.machine;
  const { job, setJob, history } = useJobs();
  const [target, setTarget] = useState(route.query.get('target') ?? '');
  const items = useMemo(() => proceduresFor(m), [m, m.circuit.components.length, m.removed.size]);
  useEffect(() => {
    if (job && job.m !== m) setJob(null);
  }, [m, job, setJob]);
  const sel = items.find((i) => i.key === target);
  const start = (proc: Procedure) => setJob(new WorkshopJob(m, proc, st.profile, machineFromProfile(st.profile).circuit, (type, id, detail) => {
    const s = useWorkbay.getState().session;
    if (type === 'replace') s?.recordReplacement(id);
    else s?.record(type === 'safety' ? 'safety' : 'repair', id, detail);
  }));

  return (
    <div className={p.splitL} style={{ gridTemplateColumns: '300px minmax(0,1fr) 300px' }}>
      <Panel title="Select work">
        <div className={`${p.list} ${p.scrollTall}`}>
          {['Components', 'Hoses & fittings', 'Electrical', 'Drivetrain', 'Fluid'].map((g) => (
            <div key={g}>
              <div className={p.small} style={{ textTransform: 'uppercase', letterSpacing: '0.05em', margin: '6px 0 4px' }}>{g}</div>
              {items.filter((i) => i.group === g).map((i) => (
                <button key={i.key} className={`${p.item} ${target === i.key ? p.itemActive : ''}`} onClick={() => setTarget(i.key)} style={{ marginBottom: 4 }}>
                  <div className={p.itemTitle}>{i.label} {m.removed.has(i.key.split(':')[1] ?? '') && <Badge tone="warn">removed</Badge>} {m.disconnected.has(i.key.split(':')[1] ?? '') && <Badge tone="warn">open</Badge>}</div>
                </button>
              ))}
            </div>
          ))}
        </div>
      </Panel>
      <div className={p.stack}>
        {job ? (
          <JobRunner job={job} onClose={() => setJob(null)} />
        ) : sel ? (
          <Panel title={`Procedures – ${sel.label}`}>
            <div className={p.list}>
              {sel.procs().map((proc) => (
                <div key={proc.id} className={p.item} style={{ cursor: 'default' }}>
                  <div className={p.itemTitle}>{proc.title}</div>
                  <div className={p.itemSub}>{proc.steps.length} steps · {proc.summary}</div>
                  <div style={{ marginTop: 6 }}>
                    <Button size="sm" variant="primary" onClick={() => start(proc)}>
                      <Play size={13} /> Start job
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        ) : (
          <Panel title="Procedure">
            <div className={p.small}>Choose a component, line, circuit or system on the left. Diagnose before you replace – unnecessary replacements are scored against you in diagnostic scenarios.</div>
          </Panel>
        )}
        {history.length > 0 && (
          <Panel title="Repair history">
            {history.map((h, i) => (
              <div key={i} className={p.small}>
                {h.t.toFixed(0)} s · {h.title} · {h.steps} steps completed
              </div>
            ))}
          </Panel>
        )}
      </div>
      <div className={p.stack}>
        <SafetyStatus />
        <Panel title="Next">
          <div className={p.small}>
            After the job, operate the equipment in the <a href={href('simulator')}>Equipment Simulator</a> and complete the verification checks{st.session ? ' in the Diagnostic Center' : ''}.
          </div>
        </Panel>
      </div>
    </div>
  );
}

function JobRunner({ job, onClose }: { job: WorkshopJob; onClose(): void }) {
  useTick();
  const bump = useWorkbay((s) => s.bump);
  const m = job.m;
  const next = job.procedure.steps.find((s) => !job.done.has(s.id));
  const [stepId, setStepId] = useState(next?.id ?? job.procedure.steps[0]!.id);
  const step = job.procedure.steps.find((s) => s.id === stepId)!;
  const [results, setResults] = useState<Record<string, StepResult>>({});
  const [cap, setCap] = useState(true);
  const [partId, setPartId] = useState('');
  const [hoseId, setHoseId] = useState('');
  const [ack, setAck] = useState(false);
  const [litres, setLitres] = useState(20);
  const [grade, setGrade] = useState(m.circuit.specifiedFluidGrade ?? 'iso-vg-46');
  const [mapping, setMapping] = useState<Record<string, ReconnectChoice>>({});
  const blockers = job.blockers(step);
  const t = job.procedure.target;
  const removedType = t.kind === 'component' ? (m.removed.get(t.id) ?? m.circuit.components.find((c) => c.id === t.id))?.type : undefined;
  const torqueSpec = job.profile.specs['torque.orb16'];

  const portOptions = () => {
    const opts: { value: string; label: string }[] = [];
    for (const c of m.circuit.components) {
      if (c.type === 'open-port') continue;
      for (const pt of getModel(c.type).ports(c)) opts.push({ value: `${c.id}.${pt.id}`, label: `${c.label} – port ${pt.marking}` });
    }
    return opts;
  };
  const toRef = (v: string) => {
    const [component, port] = v.split('.') as [string, string];
    return { component, port };
  };

  const run = () => {
    const reconnect = step.op === 'reconnect' ? job.lines.map((l) => mapping[l] ?? { connection: l, ...(job.tags[l] ?? { from: m.circuit.connections.find((c) => c.id === l)!.from, to: m.circuit.connections.find((c) => c.id === l)!.to }) }) : undefined;
    const r = job.run(step.id, { capEnds: cap, partId, hoseId, acknowledgeSpec: ack, litres, grade, reconnect });
    setResults({ ...results, [step.id]: r });
    bump();
    if (r.ok) {
      const n = job.procedure.steps.find((s) => !job.done.has(s.id));
      if (n && step.op !== 'inspect-removed' && step.op !== 'verify-connections' && step.op !== 'select-part') setStepId(n.id);
    }
  };
  const res = results[step.id];

  return (
    <Panel title={job.procedure.title} icon={<Wrench size={14} />} actions={<Button size="sm" onClick={onClose}>Close job</Button>}>
      <Callout tone="warn">{job.procedure.documentNote}</Callout>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 240px) 1fr', gap: 12, marginTop: 10 }}>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {job.procedure.steps.map((s, i) => {
            const done = job.done.has(s.id);
            const blocked = !done && job.blockers(s).length > 0;
            return (
              <li key={s.id}>
                <button className={`${p.item} ${s.id === stepId ? p.itemActive : ''}`} style={{ padding: '5px 8px' }} onClick={() => setStepId(s.id)}>
                  <div className={p.itemTitle} style={{ fontWeight: 500, fontSize: 12.5 }}>
                    {done ? <CheckCircle2 size={13} color="var(--ok)" /> : blocked ? <Lock size={13} color="var(--muted)" /> : <Circle size={13} color="var(--accent)" />}
                    {i + 1}. {s.title}
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
        <div className={p.list}>
          <h3>{step.title}</h3>
          <div style={{ color: 'var(--text-2)' }}>{step.instruction}</div>
          {step.safety && <Callout tone="danger" title="Safety">{step.safety}</Callout>}
          {blockers.length > 0 && !job.done.has(step.id) && (
            <Callout tone="warn" title="Prerequisites not met">
              {blockers.map((b) => (
                <div key={b}>• {b}</div>
              ))}
            </Callout>
          )}
          {step.op === 'disconnect-lines' && (
            <label className={p.small} style={{ display: 'flex', gap: 6 }}>
              <input type="checkbox" checked={cap} onChange={(e) => setCap(e.target.checked)} /> Cap and plug ports and hose ends immediately
            </label>
          )}
          {step.op === 'select-part' && removedType && (
            <Field label="Replacement part (parts store)">
              <Select value={partId} onChange={(e) => setPartId(e.target.value)} options={[{ value: '', label: 'Select part…' }, ...partsForType(removedType).map((x) => ({ value: x.id, label: `${x.partNumber} – ${x.name}` }))]} />
            </Field>
          )}
          {step.op === 'replace-hose' && (
            <Field label="Hose assembly">
              <Select value={hoseId} onChange={(e) => setHoseId(e.target.value)} options={[{ value: '', label: 'Select hose…' }, ...HOSES.map((h) => ({ value: h.id, label: h.name }))]} />
            </Field>
          )}
          {step.op === 'torque' && (
            <Callout tone={torqueSpec?.status === 'manufacturer-verified' ? 'ok' : 'warn'} title={`Torque specification – ${torqueSpec?.status ?? 'none on file'}`}>
              {torqueSpec?.status === 'manufacturer-verified' ? `${torqueSpec.value} ${torqueSpec.unit ?? ''}` : 'No manufacturer-verified torque value is on file for this equipment profile. This application does not invent torque values. Obtain the value from the fitting manufacturer or the equipment service manual.'}
              <label style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I have verified the applicable torque specification
              </label>
            </Callout>
          )}
          {step.op === 'reconnect' && (
            <div className="tableWrap">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th>Tagged line</th>
                    <th>From port</th>
                    <th>To port</th>
                  </tr>
                </thead>
                <tbody>
                  {job.lines.map((l) => {
                    const c = m.circuit.connections.find((x) => x.id === l)!;
                    const cur = mapping[l] ?? { connection: l, ...(job.tags[l] ?? { from: c.from, to: c.to }) };
                    return (
                      <tr key={l}>
                        <td>
                          {c.label}
                          <div className={p.small}>tag: {job.tags[l] ? `${job.tags[l]!.from.port} → ${job.tags[l]!.to.port}` : 'not tagged'}</div>
                        </td>
                        <td>
                          <Select value={`${cur.from.component}.${cur.from.port}`} onChange={(e) => setMapping({ ...mapping, [l]: { ...cur, from: toRef(e.target.value) } })} options={portOptions()} />
                        </td>
                        <td>
                          <Select value={`${cur.to.component}.${cur.to.port}`} onChange={(e) => setMapping({ ...mapping, [l]: { ...cur, to: toRef(e.target.value) } })} options={portOptions()} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {step.op === 'top-up' && (
            <Field label="Litres to add">
              <Select value={String(litres)} onChange={(e) => setLitres(Number(e.target.value))} options={[5, 10, 20, 40, 60].map((v) => ({ value: String(v), label: `${v} L of specified fluid` }))} />
            </Field>
          )}
          {step.op === 'flush' && (
            <Field label="Refill with">
              <Select value={grade} onChange={(e) => setGrade(e.target.value)} options={Object.values(FLUID_GRADES).map((g) => ({ value: g.id, label: `${g.name}${g.id === m.circuit.specifiedFluidGrade ? ' (specified)' : ''}` }))} />
            </Field>
          )}
          <div className={p.row}>
            <Button variant="primary" onClick={run} disabled={job.done.has(step.id) && !['inspect-removed', 'verify-connections', 'verify-zero', 'select-part'].includes(step.op)}>
              <Play size={13} /> {job.done.has(step.id) ? 'Done' : 'Perform step'}
            </Button>
          </div>
          {res && (
            <Callout tone={res.ok ? 'ok' : 'danger'} title={res.message}>
              {res.details?.map((d, i) => (
                <div key={i}>• {d}</div>
              ))}
              {res.issues?.map((iss, i) => (
                <div key={i} style={{ color: iss.severity === 'blocking' ? 'var(--danger)' : 'var(--warn)' }}>
                  {iss.severity === 'blocking' ? '✗' : '⚠'} {iss.message} – {iss.consequence}
                </div>
              ))}
              {res.bench && (
                <div style={{ marginTop: 6 }}>
                  <strong>{res.bench.title}</strong>
                  <table className={tableClass}>
                    <tbody>
                      {res.bench.points.map((pt, i) => (
                        <tr key={i}>
                          <td>{pt.label}</td>
                          <td className={p.mono}>{pt.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div>{res.bench.summary}</div>
                </div>
              )}
            </Callout>
          )}
        </div>
      </div>
    </Panel>
  );
}

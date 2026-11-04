import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { LIBRARY, COMPARISONS, type LibraryEntry } from '@/data/components/library';
import { symbolFor } from '@/visualization/schematics/symbols';
import { getModel, hasModel } from '@/simulation/components/registry';
import { FAULT_KINDS } from '@/simulation/failures/catalog';
import { CylinderCutaway, GearPumpCutaway, PtoCutaway, ReliefCutaway, SpoolValveCutaway } from '@/visualization/cutaways/Cutaways';
import { Badge, Button, Callout, Panel, Range, Select, TextInput, tableClass } from '@/components/ui';
import p from '../shared/page.module.css';

const CATS = ['All', 'Pumps', 'Valves', 'Actuators', 'Supporting components', 'Drive'] as const;

function SymbolView({ e }: { e: LibraryEntry }) {
  const type = e.simType ?? e.symbolType;
  if (!type || !hasModel(type)) return <div className={p.small}>No ISO symbol in this library for this item.</div>;
  const params: Record<string, string | number | boolean | number[]> = {};
  for (const ps of getModel(type).params) params[ps.key] = ps.default;
  Object.assign(params, e.symbolParams ?? {});
  const def = { id: 'x', type, label: e.name, params };
  const g = symbolFor(def);
  const ports = getModel(type).ports(def);
  return (
    <svg viewBox={`-30 -24 ${g.w + 60} ${g.h + 48}`} width="100%" style={{ maxHeight: 180, background: '#0e1013', borderRadius: 4 }} role="img" aria-label={`ISO symbol for ${e.name}`}>
      <g>{g.render(null)}</g>
      {ports.map((pt) => {
        const a = g.ports[pt.id];
        if (!a) return null;
        return (
          <g key={pt.id}>
            <circle cx={a.x} cy={a.y} r={3} fill="#0e1013" stroke="#f2a93b" />
            <text x={a.x + (a.side === 'left' ? -12 : 6)} y={a.y + (a.side === 'top' ? -6 : a.side === 'bottom' ? 14 : 4)} fontSize={10} fill="#f2a93b" fontFamily="monospace">
              {pt.marking}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function InteractiveCutaway({ kind }: { kind: NonNullable<LibraryEntry['cutaway']> }) {
  const [v, setV] = useState(kind === 'spool' ? 0 : kind === 'gear' ? 900 : 0.5);
  if (kind === 'gear') return (<><GearPumpCutaway rpm={v} /><Range label="Shaft speed" value={v} min={0} max={2400} step={50} onChange={setV} display={`${v} rpm`} /></>);
  if (kind === 'spool') return (<><SpoolValveCutaway spool={v} four /><Range label="Spool position (move the lever)" value={v} min={-1} max={1} step={0.05} onChange={setV} display={v.toFixed(2)} /></>);
  if (kind === 'relief') return (<><ReliefCutaway opening={Math.max(0, (v - 0.6) / 0.4)} pressure={v * 200e5} setting={120e5} /><Range label="Inlet pressure" value={v} min={0} max={1} step={0.01} onChange={setV} display={`${Math.round(v * 200)} bar`} /></>);
  if (kind === 'cylinder') return (<><CylinderCutaway extension={v} stages={3} single pressure={60e5 + v * 40e5} /><Range label="Extension" value={v} min={0} max={1} step={0.01} onChange={setV} display={`${Math.round(v * 100)} %`} /></>);
  return (<><PtoCutaway engaged={v > 0.5} rpm={v > 0.5 ? 900 : 0} /><Button size="sm" onClick={() => setV(v > 0.5 ? 0 : 1)}>{v > 0.5 ? 'Disengage' : 'Engage'} PTO</Button></>);
}

export default function ComponentLibraryPage() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<(typeof CATS)[number]>('All');
  const [id, setId] = useState(LIBRARY[0]!.id);
  const [compare, setCompare] = useState<string>('');
  const [answer, setAnswer] = useState<number | null>(null);
  const list = useMemo(() => LIBRARY.filter((e) => (cat === 'All' || e.category === cat) && (q === '' || `${e.name} ${e.description} ${e.applications.join(' ')}`.toLowerCase().includes(q.toLowerCase()))), [q, cat]);
  const e = LIBRARY.find((x) => x.id === id)!;
  const other = LIBRARY.find((x) => x.id === compare);
  const preset = COMPARISONS.find((c) => (c.a === e.id && c.b === compare) || (c.b === e.id && c.a === compare));
  const simFaults = e.simType ? FAULT_KINDS.filter((f) => f.appliesTo?.includes(e.simType!)) : [];
  return (
    <div className={p.page}>
      <div className={p.head}>
        <div className={p.grow}>
          <h1>Component Library</h1>
          <p>Function, internal operation, schematic symbol, failure modes, symptoms, tests and replacement considerations. Entries marked “simulated” share their definition with the simulation engine.</p>
        </div>
      </div>
      <div className={p.splitL}>
        <Panel title="Components">
          <div className={p.list}>
            <div style={{ position: 'relative' }}>
              <TextInput placeholder="Search components…" value={q} onChange={(ev) => setQ(ev.target.value)} aria-label="Search components" />
              <Search size={14} style={{ position: 'absolute', right: 8, top: 9, color: 'var(--muted)' }} />
            </div>
            <Select value={cat} onChange={(ev) => setCat(ev.target.value as typeof cat)} options={CATS.map((c) => ({ value: c, label: c }))} aria-label="Category" />
            <div className={p.scrollTall}>
              {list.map((x) => (
                <button key={x.id} className={`${p.item} ${x.id === id ? p.itemActive : ''}`} style={{ marginBottom: 4 }} onClick={() => { setId(x.id); setAnswer(null); setCompare(''); }}>
                  <div className={p.itemTitle}>{x.name}</div>
                  <div className={p.itemSub}>{x.category}{x.simType ? ' · simulated' : ''}</div>
                </button>
              ))}
            </div>
          </div>
        </Panel>
        <div className={p.stack}>
          <Panel title={e.name} actions={<>{e.simType && <Badge tone="info">simulated model: {e.simType}</Badge>}<Badge>{e.category}</Badge></>}>
            <div className={p.cols2}>
              <div className={p.list}>
                <p style={{ color: 'var(--text-2)' }}>{e.description}</p>
                <h3>Internal operating principle</h3>
                <p style={{ color: 'var(--text-2)' }}>{e.operation}</p>
                <h3>Circuit placement</h3>
                <p style={{ color: 'var(--text-2)' }}>{e.placement}</p>
              </div>
              <div className={p.list}>
                <h3>Schematic symbol</h3>
                <SymbolView e={e} />
                {e.cutaway && (
                  <>
                    <h3>Interactive cutaway</h3>
                    <InteractiveCutaway key={e.id} kind={e.cutaway} />
                  </>
                )}
              </div>
            </div>
          </Panel>
          <div className={p.cols2}>
            <Panel title="Applications & failure modes">
              <h3>Typical applications</h3>
              <ul className={p.small}>{e.applications.map((a) => <li key={a}>{a}</li>)}</ul>
              <h3>Common failures</h3>
              <ul className={p.small}>{e.failures.map((a) => <li key={a}>{a}</li>)}</ul>
              {simFaults.length > 0 && (
                <div className={p.row}>
                  {simFaults.map((f) => <Badge key={f.kind} tone="warn">{f.label}</Badge>)}
                </div>
              )}
            </Panel>
            <Panel title="Symptoms, testing & replacement">
              <h3>Symptoms</h3>
              <ul className={p.small}>{e.symptoms.map((a) => <li key={a}>{a}</li>)}</ul>
              <h3>Diagnostic procedures</h3>
              <ul className={p.small}>{e.testing.map((a) => <li key={a}>{a}</li>)}</ul>
              <h3>Replacement considerations</h3>
              <ul className={p.small}>{e.replacement.map((a) => <li key={a}>{a}</li>)}</ul>
              <div className={p.small}>Manufacturer-specific documentation is attached per equipment in Equipment Profiles.</div>
            </Panel>
          </div>
          <Panel title="Compare">
            <div className={p.row}>
              <span className={p.small}>Compare {e.name} with</span>
              <div style={{ minWidth: 260 }}>
                <Select value={compare} onChange={(ev) => setCompare(ev.target.value)} options={[{ value: '', label: 'Select component…' }, ...LIBRARY.filter((x) => x.id !== e.id).map((x) => ({ value: x.id, label: x.name }))]} />
              </div>
              {e.id === 'relief' && !compare && <Button size="sm" onClick={() => setCompare('reducing')}>Relief vs reducing valve</Button>}
            </div>
            {other && (
              <div className="tableWrap" style={{ marginTop: 8 }}>
                <table className={tableClass}>
                  <thead>
                    <tr>
                      <th />
                      <th>{e.name}</th>
                      <th>{other.name}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preset
                      ? preset.points.map(([k, a, b]) => (
                          <tr key={k}>
                            <td>{k}</td>
                            <td>{preset.a === e.id ? a : b}</td>
                            <td>{preset.a === e.id ? b : a}</td>
                          </tr>
                        ))
                      : null}
                    <tr>
                      <td>Function</td>
                      <td className={p.small}>{e.description}</td>
                      <td className={p.small}>{other.description}</td>
                    </tr>
                    <tr>
                      <td>Operation</td>
                      <td className={p.small}>{e.operation}</td>
                      <td className={p.small}>{other.operation}</td>
                    </tr>
                    <tr>
                      <td>Placement</td>
                      <td className={p.small}>{e.placement}</td>
                      <td className={p.small}>{other.placement}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          {e.quiz && (
            <Panel title="Component quiz">
              <p>{e.quiz.q}</p>
              <div className={p.row}>
                {e.quiz.options.map((o, i) => (
                  <Button key={o} active={answer === i} onClick={() => setAnswer(i)}>
                    {o}
                  </Button>
                ))}
              </div>
              {answer !== null && (
                <div style={{ marginTop: 8 }}>
                  <Callout tone={answer === e.quiz.answer ? 'ok' : 'warn'} title={answer === e.quiz.answer ? 'Correct' : 'Not quite'}>
                    {e.quiz.why}
                  </Callout>
                </div>
              )}
            </Panel>
          )}
          {e.related.length > 0 && (
            <div className={p.row}>
              <span className={p.small}>Related:</span>
              {e.related.map((r) => {
                const x = LIBRARY.find((k) => k.id === r);
                return x ? (
                  <Button key={r} size="sm" onClick={() => { setId(r); setAnswer(null); }}>
                    {x.name}
                  </Button>
                ) : null;
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

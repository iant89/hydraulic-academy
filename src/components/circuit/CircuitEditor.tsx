import { useMemo, useState, type ReactNode } from 'react';
import { Pause, Play, Plus, RotateCcw, Trash2, ShieldCheck } from 'lucide-react';
import type { CircuitDefinition, ComponentInstanceDefinition, ConnectionDefinition, LineType, PortRef, PortRole } from '@/simulation/hydraulics/types';
import { COMPONENT_MODELS, getModel } from '@/simulation/components/registry';
import { FAULT_KINDS } from '@/simulation/failures/catalog';
import { validateCircuit, type ValidationIssue } from '@/simulation/circuits/validation';
import { BAR, MM } from '@/simulation/core/units';
import { Schematic, LINE_LABELS, type Selection } from '@/visualization/schematics/Schematic';
import { Badge, Button, Callout, Field, Panel, Range, Select, Stat, TextInput } from '@/components/ui';
import { useFmt } from '@/components/equipment/useQ';
import { useLocalSim } from './useLocalSim';

const roleLine = (a?: PortRole, b?: PortRole): LineType => {
  const r = [a, b];
  if (r.includes('pump-inlet') || r.includes('suction-out')) return 'suction';
  if (r.includes('drain') || r.includes('drain-in')) return 'case-drain';
  if (r.includes('pilot')) return 'pilot';
  if (r.includes('load-sense')) return 'load-sense';
  if (r.includes('pump-outlet') || r.includes('supply')) return 'pressure';
  if (r.includes('tank') || r.includes('return-in')) return 'return';
  if (r.includes('work')) return 'work';
  return 'pressure';
};

export interface EditorProps {
  initial: CircuitDefinition;
  /** Allow adding/removing components (false in guided connection exercises). */
  allowComponents?: boolean;
  /** Extra panels below the editor that receive the current circuit. */
  footer?(circuit: CircuitDefinition, issues: ValidationIssue[]): ReactNode;
  onChange?(circuit: CircuitDefinition): void;
  highlight?: { ports: Set<string>; connections: Set<string> };
  height?: number;
}

export function CircuitEditor({ initial, allowComponents = true, footer, onChange, highlight, height = 520 }: EditorProps) {
  const [circuit, setCircuitState] = useState<CircuitDefinition>(() => structuredClone(initial));
  const local = useLocalSim(initial);
  const { sim, tick } = local;
  const fmt = useFmt();
  const [sel, setSel] = useState<Selection>(null);
  const [pending, setPending] = useState<PortRef | null>(null);
  const [addType, setAddType] = useState('gauge');
  const [showIssues, setShowIssues] = useState(true);
  const issues = useMemo(() => validateCircuit(circuit), [circuit]);

  const setCircuit = (c: CircuitDefinition, rebuild = true) => {
    setCircuitState(c);
    onChange?.(c);
    if (rebuild) local.rebuild(c);
  };

  const onPort = (ref: PortRef) => {
    if (!pending) return setPending(ref);
    if (pending.component === ref.component && pending.port === ref.port) return setPending(null);
    const role = (r: PortRef) => {
      const c = circuit.components.find((x) => x.id === r.component)!;
      return getModel(c.type).ports(c).find((p) => p.id === r.port)?.role;
    };
    const lineType = roleLine(role(pending), role(ref));
    const id = `L${Date.now().toString(36).slice(-5)}`;
    const conn: ConnectionDefinition = {
      id,
      from: pending,
      to: ref,
      lineType,
      label: `${pending.component}.${pending.port} → ${ref.component}.${ref.port}`,
      hose: { innerDiameter: (lineType === 'suction' ? 32 : lineType === 'return' ? 16 : 12.7) * MM, length: 1.5, workingPressure: (lineType === 'suction' ? 10 : 207) * BAR, construction: lineType === 'suction' ? 'suction-hose' : 'hose' },
    };
    setCircuit({ ...circuit, connections: [...circuit.connections, conn] });
    setPending(null);
    setSel({ kind: 'connection', id });
  };

  const addComponent = () => {
    const model = getModel(addType);
    let n = 1;
    while (circuit.components.some((c) => c.id === `${addType}${n}`)) n++;
    const params: ComponentInstanceDefinition['params'] = {};
    for (const p of model.params) params[p.key] = p.default;
    const maxX = Math.max(0, ...circuit.components.map((c) => c.layout?.x ?? 0));
    const comp: ComponentInstanceDefinition = { id: `${addType}${n}`, type: addType, label: `${model.name.split('(')[0]!.trim()} ${n}`, params, layout: { x: Math.min(maxX + 3, 20), y: 2 } };
    setCircuit({ ...circuit, components: [...circuit.components, comp] });
    setSel({ kind: 'component', id: comp.id });
  };

  const del = () => {
    if (!sel) return;
    if (sel.kind === 'connection') setCircuit({ ...circuit, connections: circuit.connections.filter((c) => c.id !== sel.id) });
    else if (allowComponents) setCircuit({ ...circuit, components: circuit.components.filter((c) => c.id !== sel.id), connections: circuit.connections.filter((c) => c.from.component !== sel.id && c.to.component !== sel.id) });
    setSel(null);
  };

  const comp = sel?.kind === 'component' ? circuit.components.find((c) => c.id === sel.id) : undefined;
  const cn = sel?.kind === 'connection' ? circuit.connections.find((c) => c.id === sel.id) : undefined;
  const updComp = (patch: ComponentInstanceDefinition['params'], label?: string) => {
    if (!comp) return;
    setCircuit({ ...circuit, components: circuit.components.map((c) => (c.id === comp.id ? { ...c, label: label ?? c.label, params: { ...c.params, ...patch } } : c)) });
  };
  const updConn = (patch: Partial<ConnectionDefinition>) => {
    if (!cn) return;
    setCircuit({ ...circuit, connections: circuit.connections.map((c) => (c.id === cn.id ? { ...c, ...patch } : c)) });
  };

  const issuePorts = new Set<string>([...(highlight?.ports ?? []), ...(showIssues ? issues.filter((i) => i.severity !== 'info').flatMap((i) => i.ports.map((pp) => `${pp.component}.${pp.port}`)) : [])]);
  const issueConns = new Set<string>([...(highlight?.connections ?? []), ...(showIssues ? issues.filter((i) => i.severity === 'danger' || i.severity === 'error').flatMap((i) => i.connections) : [])]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 12 }} className="lab">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button size="sm" onClick={() => local.setRunning(!local.running)}>
              {local.running ? <Pause size={13} /> : <Play size={13} />} {local.running ? 'Pause' : 'Run'}
            </Button>
            <Button size="sm" onClick={() => local.reset(circuit)}>
              <RotateCcw size={13} /> Reset state
            </Button>
            {allowComponents && (
              <>
                <select value={addType} onChange={(e) => setAddType(e.target.value)} aria-label="Component to add" style={{ height: 26, background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 4, fontSize: 12 }}>
                  {COMPONENT_MODELS.filter((m) => m.type !== 'open-port').map((m) => (
                    <option key={m.type} value={m.type}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <Button size="sm" onClick={addComponent}>
                  <Plus size={13} /> Add
                </Button>
              </>
            )}
            <Button size="sm" onClick={del} disabled={!sel || (sel.kind === 'component' && !allowComponents)}>
              <Trash2 size={13} /> Delete selected
            </Button>
            <Button size="sm" active={showIssues} onClick={() => setShowIssues(!showIssues)}>
              <ShieldCheck size={13} /> Show issues
            </Button>
            <span style={{ fontSize: 12, color: pending ? 'var(--accent)' : 'var(--muted)' }}>{pending ? `Connecting from ${pending.component}.${pending.port} – click the destination port (or the same port to cancel)` : 'Click a port, then another port, to connect a hose. Drag symbols to arrange.'}</span>
          </div>
          <div style={{ height }}>
            <Schematic
              circuit={circuit}
              sim={sim}
              tick={tick}
              editable
              selected={sel}
              onSelect={setSel}
              onMove={(id, x, y) => setCircuit({ ...circuit, components: circuit.components.map((c) => (c.id === id ? { ...c, layout: { x, y } } : c)) }, false)}
              onPortClick={onPort}
              pendingPort={pending}
              issuePorts={issuePorts}
              issueConnections={issueConns}
              minCells={[22, 13]}
            />
          </div>
          {local.error && <Callout tone="danger">{local.error}</Callout>}
        </div>
        <Panel title={comp ? comp.label : cn ? 'Hydraulic line' : 'Inspector'}>
          {!comp && !cn && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Select a component or line to edit its parameters, operate it, or inject a failure.</div>}
          {comp && <ComponentInspector comp={comp} sim={sim} onParams={updComp} fmt={fmt} />}
          {cn && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Field label="Label">
                <TextInput value={cn.label ?? ''} onChange={(e) => updConn({ label: e.target.value })} />
              </Field>
              <Field label="Line function">
                <Select value={cn.lineType} onChange={(e) => updConn({ lineType: e.target.value as LineType })} options={(Object.keys(LINE_LABELS) as LineType[]).map((k) => ({ value: k, label: LINE_LABELS[k] }))} />
              </Field>
              <Field label="Hose inner diameter (mm)">
                <TextInput type="number" min={4} max={102} value={(cn.hose.innerDiameter * 1000).toFixed(1)} onChange={(e) => updConn({ hose: { ...cn.hose, innerDiameter: Math.min(102, Math.max(4, Number(e.target.value))) / 1000 } })} />
              </Field>
              <Field label="Length (m)">
                <TextInput type="number" min={0.1} max={30} step={0.1} value={cn.hose.length} onChange={(e) => updConn({ hose: { ...cn.hose, length: Math.min(30, Math.max(0.1, Number(e.target.value))) } })} />
              </Field>
              <Field label="Working pressure rating (bar)">
                <TextInput type="number" min={5} max={700} value={(cn.hose.workingPressure / BAR).toFixed(0)} onChange={(e) => updConn({ hose: { ...cn.hose, workingPressure: Math.min(700, Math.max(5, Number(e.target.value))) * BAR } })} />
              </Field>
              <Field label="Construction">
                <Select value={cn.hose.construction ?? 'hose'} onChange={(e) => updConn({ hose: { ...cn.hose, construction: e.target.value as 'hose' } })} options={[{ value: 'hose', label: 'Braided pressure hose' }, { value: 'suction-hose', label: 'Wire-helix suction hose' }, { value: 'tube', label: 'Rigid tube' }]} />
              </Field>
              <Stat label="Live flow" value={fmt(sim.flowThrough(cn.id), 'flow')} />
              <FaultSliders target={cn.id} kinds={FAULT_KINDS.filter((k) => k.target === 'connection').map((k) => k.kind)} sim={sim} />
            </div>
          )}
        </Panel>
      </div>
      {showIssues && issues.length > 0 && (
        <Panel title="Circuit validation" actions={<Badge tone={issues.some((i) => i.severity === 'danger') ? 'danger' : issues.some((i) => i.severity === 'error') ? 'warn' : 'info'}>{issues.length} finding(s)</Badge>}>
          <IssueList issues={issues} />
        </Panel>
      )}
      {footer?.(circuit, issues)}
    </div>
  );
}

export function IssueList({ issues }: { issues: ValidationIssue[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {issues.map((i, k) => (
        <Callout key={k} tone={i.severity === 'danger' ? 'danger' : i.severity === 'error' ? 'warn' : 'info'} title={`${i.severity.toUpperCase()}: ${i.message}`}>
          <div>
            <strong>Why:</strong> {i.why}
          </div>
          <div>
            <strong>If operated:</strong> {i.consequence}
          </div>
          <div>
            <strong>Fix:</strong> {i.fix}
          </div>
        </Callout>
      ))}
    </div>
  );
}

function ComponentInspector({ comp, sim, onParams, fmt }: { comp: ComponentInstanceDefinition; sim: ReturnType<typeof useLocalSim>['sim']; onParams(p: ComponentInstanceDefinition['params'], label?: string): void; fmt: ReturnType<typeof useFmt> }) {
  const model = getModel(comp.type);
  const [, force] = useState(0);
  const rt = sim.components.get(comp.id);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{model.summary}</div>
      <Field label="Label">
        <TextInput value={comp.label} onChange={(e) => onParams({}, e.target.value)} />
      </Field>
      {model.inputs.length > 0 && rt && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {model.inputs.map((inp) => {
            const v = rt.inputs[inp.key] ?? inp.default;
            return <Range key={inp.key} label={`${inp.label} (live)`} value={v} min={inp.min} max={inp.max} step={inp.step} onChange={(x) => { rt.inputs[inp.key] = x; force((n) => n + 1); }} display={fmt(v, inp.quantity)} />;
          })}
        </div>
      )}
      {model.params.filter((p) => !p.live).map((p) => {
        const v = comp.params[p.key] ?? p.default;
        if (p.options) return <Field key={p.key} label={p.label}><Select value={String(v)} onChange={(e) => onParams({ [p.key]: e.target.value })} options={p.options} /></Field>;
        if (typeof p.default === 'boolean') return <label key={p.key} style={{ display: 'flex', gap: 6, fontSize: 12 }}><input type="checkbox" checked={v === true} onChange={(e) => onParams({ [p.key]: e.target.checked })} /> {p.label}</label>;
        if (Array.isArray(v)) return <Field key={p.key} label={p.label}><TextInput value={(v as number[]).join(',')} readOnly /></Field>;
        return (
          <Field key={p.key} label={`${p.label}${p.description ? ` (${p.description})` : ''}`}>
            <TextInput
              type="number"
              min={p.min}
              max={p.max}
              step={p.step ?? 'any'}
              value={Number(v)}
              onChange={(e) => {
                let x = Number(e.target.value);
                if (!Number.isFinite(x)) return;
                if (p.min !== undefined) x = Math.max(p.min, x);
                if (p.max !== undefined) x = Math.min(p.max, x);
                onParams({ [p.key]: x });
              }}
            />
          </Field>
        );
      })}
      {rt && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {rt.readouts(sim.env()).filter((r) => typeof r.value === 'number').slice(0, 8).map((r) => (
            <Stat key={r.key} label={r.label} value={fmt(r.value as number, r.quantity ?? 'none')} />
          ))}
        </div>
      )}
      <FaultSliders target={comp.id} kinds={model.faultKinds} sim={sim} />
    </div>
  );
}

function FaultSliders({ target, kinds, sim }: { target: string; kinds: string[]; sim: ReturnType<typeof useLocalSim>['sim'] }) {
  const [, force] = useState(0);
  if (!kinds.length) return null;
  return (
    <details>
      <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text-2)' }}>Failure injection</summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
        {kinds.map((k) => {
          const info = FAULT_KINDS.find((f) => f.kind === k);
          const f = sim.faults.faults.find((x) => x.spec.target === target && x.spec.kind === k);
          const v = f?.severity ?? 0;
          return (
            <Range
              key={k}
              label={info?.label ?? k}
              value={v}
              min={0}
              max={1}
              step={0.05}
              onChange={(x) => {
                if (f) f.severity = x;
                else sim.faults.add({ id: `${target}:${k}`, kind: k, target, severity: x });
                force((n) => n + 1);
              }}
              display={`${Math.round(v * 100)} %`}
            />
          );
        })}
      </div>
    </details>
  );
}

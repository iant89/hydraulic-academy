import { useMemo, useState } from 'react';
import { Bug } from 'lucide-react';
import { useWorkbay } from '@/stores/workbay';
import { FAULT_KINDS } from '@/simulation/failures/catalog';
import { Badge, Button, Callout, Panel, Range, Select } from '@/components/ui';
import type { FaultActivation } from '@/simulation/failures/faults';

/** Practice-mode fault injection (disabled while a diagnostic scenario is active – faults must stay hidden). */
export function FaultInjector() {
  const st = useWorkbay();
  const m = st.machine;
  const targets = useMemo(() => {
    const t: { value: string; label: string; kind: string; type?: string }[] = [];
    for (const c of m.circuit.components) if (c.type !== 'open-port') t.push({ value: c.id, label: `Component – ${c.label}`, kind: 'component', type: c.type });
    for (const c of m.circuit.connections) t.push({ value: c.id, label: `Line – ${c.label}`, kind: 'connection' });
    t.push({ value: 'pto', label: 'PTO assembly', kind: 'pto' });
    for (const e of m.def.electrical) t.push({ value: e.id, label: `Electrical – ${e.label}`, kind: 'electrical' });
    t.push({ value: 'fluid', label: 'Hydraulic fluid', kind: 'fluid' });
    return t;
  }, [m]);
  const [target, setTarget] = useState(targets[0]?.value ?? '');
  const tgt = targets.find((t) => t.value === target);
  const kinds = FAULT_KINDS.filter((k) => k.target === tgt?.kind && (!k.appliesTo || (tgt?.type && k.appliesTo.includes(tgt.type))) && !['fluid-contaminated', 'fluid-incorrect', 'fluid-water', 'low-fluid'].includes(k.kind));
  const [kind, setKind] = useState('');
  const k = kinds.find((x) => x.kind === kind) ?? kinds[0];
  const [sev, setSev] = useState(0.6);
  const [act, setAct] = useState<'always' | 'hot' | 'load' | 'intermittent'>('always');

  if (st.session) return <Panel title="Fault injection"><Callout tone="info">Disabled during a diagnostic scenario – the fault is hidden. End the scenario to practise with injected faults.</Callout></Panel>;
  const activation: FaultActivation = act === 'hot' ? { type: 'temperature', above: 50, ramp: 10 } : act === 'load' ? { type: 'load', pressureAbove: 100e5 } : act === 'intermittent' ? { type: 'intermittent', meanOn: 15, meanOff: 25 } : { type: 'always' };
  return (
    <Panel title="Fault injection (practice)" icon={<Bug size={14} />} actions={st.practiceFaults.length > 0 && <Badge tone="warn">{st.practiceFaults.length} active</Badge>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Select value={target} onChange={(e) => { setTarget(e.target.value); setKind(''); }} options={targets} aria-label="Fault target" />
        {kinds.length ? <Select value={k?.kind} onChange={(e) => setKind(e.target.value)} options={kinds.map((x) => ({ value: x.kind, label: x.label }))} aria-label="Failure mode" /> : <span style={{ color: 'var(--muted)', fontSize: 12 }}>No failure modes for this target.</span>}
        {k && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{k.description}</div>}
        <Range label="Severity" value={sev} min={0.05} max={1} step={0.05} onChange={setSev} display={`${Math.round(sev * 100)} %`} />
        <Select value={act} onChange={(e) => setAct(e.target.value as typeof act)} options={[{ value: 'always', label: 'Always present' }, { value: 'hot', label: 'Only when hot (> 50 °C)' }, { value: 'load', label: 'Only under load (> 100 bar)' }, { value: 'intermittent', label: 'Intermittent' }]} aria-label="Activation" />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Button variant="primary" disabled={!k} onClick={() => k && st.injectFault({ id: `p${Date.now()}`, kind: k.kind, target, severity: sev, activation })}>
            Inject fault
          </Button>
          <Button onClick={() => st.clearPracticeFaults()} disabled={!st.practiceFaults.length}>
            Clear all & reset
          </Button>
        </div>
      </div>
    </Panel>
  );
}

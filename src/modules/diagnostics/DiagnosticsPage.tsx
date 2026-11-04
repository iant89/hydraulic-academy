import { useState } from 'react';
import { Stethoscope, Play } from 'lucide-react';
import { SCENARIO_BRIEFS, loadScenario } from '@/data/scenarios';
import { useWorkbay } from '@/stores/workbay';
import { useTraining } from '@/stores/training';
import { Badge, Button, Panel, Tabs } from '@/components/ui';
import type { TrainingMode } from '@/simulation/scenarios/types';
import { Workspace } from './Workspace';
import p from '../shared/page.module.css';

const MODES: { id: TrainingMode; label: string; desc: string }[] = [
  { id: 'guided', label: 'Guided learning', desc: 'Instructions and hints are available. Learn the diagnostic sequence.' },
  { id: 'practical', label: 'Practical training', desc: 'Independent diagnosis of a single fault with performance evaluation.' },
  { id: 'challenge', label: 'Diagnostic challenge', desc: 'Hidden failures, no immediate answers, realistic symptoms.' },
  { id: 'master', label: 'Master technician', desc: 'Multiple simultaneous and intermittent faults. Minimal hints.' },
];

export default function DiagnosticsPage() {
  const session = useWorkbay((s) => s.session);
  const start = useWorkbay((s) => s.startScenario);
  const records = useTraining((s) => s.records);
  const [mode, setMode] = useState<TrainingMode>('guided');
  const [loading, setLoading] = useState<string | null>(null);
  if (session) return <Workspace />;
  const best = (id: string) => records.filter((r) => r.type === 'scenario' && r.refId === id).reduce<number | null>((b, r) => Math.max(b ?? 0, r.score ?? 0), null);
  return (
    <div className={p.page}>
      <div className={p.head}>
        <div className={p.grow}>
          <h1>Diagnostic Center</h1>
          <p>Symptom-based troubleshooting. Each scenario loads hidden faults into the equipment. Reproduce the complaint, inspect, measure, form hypotheses, identify every fault, repair, and verify the repair by operating the equipment.</p>
        </div>
      </div>
      <Tabs<TrainingMode> tabs={MODES.map((m) => ({ id: m.id, label: m.label }))} value={mode} onChange={setMode} />
      <p className={p.small}>{MODES.find((m) => m.id === mode)?.desc}</p>
      <div className={p.cols3}>
        {SCENARIO_BRIEFS.filter((b) => b.mode === mode).map((b) => {
          const sc = best(b.id);
          return (
            <Panel key={b.id} title={b.title} icon={<Stethoscope size={14} />} actions={sc !== null && <Badge tone={sc >= 75 ? 'ok' : 'warn'}>best {sc}</Badge>}>
              <div className={p.list}>
                <div className={p.small}>Difficulty {'●'.repeat(b.difficulty)}{'○'.repeat(5 - b.difficulty)} · {b.customer}</div>
                <div style={{ fontStyle: 'italic', color: 'var(--text-2)' }}>“{b.complaint}”</div>
                <div className={p.row}>
                  {b.learningObjectives.slice(0, 2).map((o) => (
                    <span key={o} className={p.chip}>{o}</span>
                  ))}
                </div>
                <Button
                  variant="primary"
                  disabled={loading !== null}
                  onClick={async () => {
                    setLoading(b.id);
                    start(await loadScenario(b.id));
                    setLoading(null);
                  }}
                >
                  <Play size={14} /> {loading === b.id ? 'Loading…' : 'Start scenario'}
                </Button>
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

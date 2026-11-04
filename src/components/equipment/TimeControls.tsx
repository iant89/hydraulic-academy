import { useRef } from 'react';
import { Pause, Play, RotateCcw, Camera, History } from 'lucide-react';
import { useWorkbay } from '@/stores/workbay';
import type { MachineSnapshot } from '@/simulation/machine/machine';
import { Button } from '@/components/ui';

export function TimeControls() {
  const st = useWorkbay();
  const snap = useRef<MachineSnapshot | null>(null);
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
      <Button size="sm" onClick={() => st.setRunning(!st.running)} aria-label={st.running ? 'Pause simulation' : 'Resume simulation'}>
        {st.running ? <Pause size={13} /> : <Play size={13} />} {st.running ? 'Pause' : 'Resume'}
      </Button>
      {[1, 2, 5, 10].map((t) => (
        <Button key={t} size="sm" active={st.timeScale === t} onClick={() => st.setTimeScale(t)} aria-label={`Time ×${t}`}>
          ×{t}
        </Button>
      ))}
      <Button size="sm" onClick={() => (snap.current = st.machine.snapshot())} title="Save snapshot">
        <Camera size={13} /> Snapshot
      </Button>
      <Button size="sm" onClick={() => snap.current && (st.machine.restore(snap.current), st.bump())} disabled={!snap.current} title="Restore snapshot">
        <History size={13} />
      </Button>
      <Button size="sm" onClick={() => st.reset()} title="Reset equipment">
        <RotateCcw size={13} /> Reset
      </Button>
    </div>
  );
}

import { useWorkbay } from '@/stores/workbay';
import { useTick } from '@/stores/simLoop';
import { Panel, Stat } from '@/components/ui';
import { useFmt } from './useQ';
import s from './equipment.module.css';

/** Live operating values. These are the technician's "dash" readings plus what the model exposes visually. */
export function StatusPanel() {
  useTick();
  const m = useWorkbay((st) => st.machine);
  const fmt = useFmt();
  return (
    <Panel title="Machine status">
      <div className={s.statusGrid}>
        <Stat label="Engine" value={fmt(m.engineRpm, 'rpm')} />
        <Stat label="PTO lamp" value={m.pto.state === 'engaged' ? 'ON' : 'OFF'} />
        <Stat label="Body angle" value={`${m.bodyAngle().toFixed(1)}°`} />
        <Stat label="Hoist extension" value={`${Math.round(m.cylinderExtension() * 100)} %`} />
        <Stat label="Oil temperature" value={fmt(m.sim.fluidState.temperature, 'temperature')} sub="tank sender" />
        <Stat label="Sim time" value={`${m.time.toFixed(0)} s`} />
      </div>
    </Panel>
  );
}

export function EventLog() {
  useTick();
  const m = useWorkbay((st) => st.machine);
  const ev = [...m.events].reverse().slice(0, 60);
  return (
    <Panel title="Event log">
      <div className={s.log} aria-live="polite">
        {ev.length === 0 && <span className={s.small}>No events yet.</span>}
        {ev.map((e, i) => (
          <div key={i} className={s.logRow} data-level={e.level}>
            <span className={s.logT}>{e.time.toFixed(1)} s</span>
            <span>{e.message}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

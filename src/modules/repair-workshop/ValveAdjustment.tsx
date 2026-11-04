import { useState } from 'react';
import { RotateCcw, RotateCw } from 'lucide-react';
import { useWorkbay } from '@/stores/workbay';
import { useTick } from '@/stores/simLoop';
import { BAR } from '@/simulation/core/units';
import { readGauge } from '@/simulation/sensors/instruments';
import { Badge, Button, Callout, Panel, tableClass } from '@/components/ui';
import { InstrumentsPanel } from '@/components/equipment/InstrumentsPanel';
import { OperatorControls } from '@/components/equipment/OperatorControls';
import { useFmt } from '@/components/equipment/useQ';
import p from '../shared/page.module.css';

/** Simulated adjuster: one full turn changes spring preload by this much (TRAINING value). */
const BAR_PER_TURN = 14 * BAR;

export function ValveAdjustment() {
  useTick();
  const st = useWorkbay();
  const m = st.machine;
  const fmt = useFmt();
  const relief = m.def.mainRelief;
  const spec = st.profile.specs['relief.setting'];
  const [log, setLog] = useState<{ t: number; action: string; reading: string }[]>([]);
  const [locknut, setLocknut] = useState(true);
  const tp1 = st.gauges.find((g) => g.testPoint === 'TP1');
  const reading = tp1 ? readGauge(m, 'TP1', tp1.gauge) : null;
  const atEnd = m.anyCommanded() && m.sim.readout(relief, 'open') === 1;

  const turn = (turns: number) => {
    if (locknut) return;
    if (m.anyCommanded()) {
      m.log('alarm', relief, 'unsafe-adjust', 'Adjust only with the control in neutral – never while dead-heading the pump.');
      return;
    }
    const s = m.adjustSetting(relief, turns * BAR_PER_TURN);
    st.session?.record('repair', `adjust:${relief}`, `Relief adjusted ${turns > 0 ? 'in' : 'out'} ${Math.abs(turns)} turn`);
    setLog([{ t: m.time, action: `${turns > 0 ? 'Turned IN' : 'Turned OUT'} ${Math.abs(turns)} turn`, reading: '— re-test required —' }, ...log]);
    void s;
  };

  return (
    <div className={p.split}>
      <div className={p.stack}>
        <Panel title="Main relief valve adjustment" actions={<Badge tone="warn">{spec?.status ?? 'no spec'}</Badge>}>
          <div className={p.list}>
            <Callout tone="info" title="Procedure">
              1. Identify the valve and its purpose (limits maximum hoist circuit pressure).
              <br />2. Locate the adjuster (cap nut and lock nut on the relief valve body).
              <br />3. Identify the specification and its source: <strong>{spec ? `${spec.value} ${spec.unit ?? ''}` : 'none on file'}</strong> {spec?.note && `– ${spec.note}`}
              <br />4. Install a correctly ranged gauge at TP1. Warm the oil to operating temperature.
              <br />5. With the engine at the specified speed, hold RAISE briefly at full extension and read TP1. Release immediately.
              <br />6. Return to neutral, loosen the lock nut, adjust (IN raises, OUT lowers), tighten the lock nut.
              <br />7. Re-test and compare. Record before and after values.
            </Callout>
            {spec?.status !== 'manufacturer-verified' && (
              <Callout tone="warn" title="Simulated training value">
                This setting is a simulated value for the training truck – NOT a manufacturer specification. Never apply it to real equipment; use the manufacturer’s documented setting for the model and serial number.
              </Callout>
            )}
            <div className={p.cols3}>
              <div>
                <div className={p.small}>TP1 reading</div>
                <div className="mono" style={{ fontSize: 22, color: 'var(--accent-2)' }}>{reading ? fmt(reading.value, 'pressure') : 'no gauge at TP1'}</div>
                <div className={p.small}>{atEnd ? 'At end of stroke – relief is setting the pressure' : 'Not at end of stroke'}</div>
              </div>
              <div>
                <div className={p.small}>Oil temperature</div>
                <div className="mono" style={{ fontSize: 22 }}>{fmt(m.sim.fluidState.temperature, 'temperature')}</div>
                <div className={p.small}>{m.sim.fluidState.temperature < 40 ? 'Warm up before final setting' : 'Operating temperature'}</div>
              </div>
              <div>
                <div className={p.small}>Lock nut</div>
                <Button size="sm" active={!locknut} onClick={() => setLocknut(!locknut)}>
                  {locknut ? 'Tight – loosen to adjust' : 'Loose – tighten after adjusting'}
                </Button>
              </div>
            </div>
            <div className={p.row}>
              <Button onClick={() => turn(-0.25)} disabled={locknut}>
                <RotateCcw size={14} /> ¼ turn OUT
              </Button>
              <Button onClick={() => turn(0.25)} disabled={locknut}>
                <RotateCw size={14} /> ¼ turn IN
              </Button>
              <Button
                variant="primary"
                disabled={!reading}
                onClick={() => {
                  const r = reading ? fmt(reading.value, 'pressure') : '';
                  setLog([{ t: m.time, action: atEnd ? 'Measured at end of stroke' : 'Measured (not at end of stroke)', reading: r }, ...log]);
                  st.addMeasurement('Relief test', 'TP1', r, 'gauge:TP1');
                }}
              >
                Record measurement
              </Button>
            </div>
            <div className={p.small}>Simulated adjuster: one full turn ≈ {(BAR_PER_TURN / BAR).toFixed(0)} bar (training value). Adjusting while the pump is dead-headed is recorded as a safety violation.</div>
            <table className={tableClass}>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>Reading</th>
                </tr>
              </thead>
              <tbody>
                {log.map((l, i) => (
                  <tr key={i}>
                    <td className={p.mono}>{l.t.toFixed(0)} s</td>
                    <td>{l.action}</td>
                    <td className={p.mono}>{l.reading}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Callout tone="info" title="Distinguish before you adjust">
          Raising the relief setting will NOT fix a worn pump, a restricted line, a leaking cylinder, a slipping PTO or a sticking valve. Slow raise with normal relief pressure is a flow problem; a pressure that stalls at a consistent value below specification with good flow is a relief (or load) problem. Measure first.
        </Callout>
      </div>
      <div className={p.stack}>
        <OperatorControls />
        <InstrumentsPanel compact />
      </div>
    </div>
  );
}

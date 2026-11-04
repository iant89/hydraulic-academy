import { useState } from 'react';
import { Activity, Droplet, Eye, Gauge as GaugeIcon, Ruler, Thermometer, Timer, Zap, FlaskRound } from 'lucide-react';
import { useWorkbay } from '@/stores/workbay';
import { useTick } from '@/stores/simLoop';
import { Badge, Button, Callout, Panel, Range, Select } from '@/components/ui';
import { Gauge } from '@/visualization/instruments/Gauge';
import { GAUGES, readFlowTester, readGauge, readIrTemperature, readMultimeter, readSightGlass, readTach, setFlowTesterLoad, takeFluidSample, type FluidSampleResult, type MeterMode } from '@/simulation/sensors/instruments';
import { useFmt } from './useQ';
import s from './equipment.module.css';

/** Diagnostic instruments. All readings come from the simulation engine. */
export function InstrumentsPanel({ compact }: { compact?: boolean }) {
  useTick();
  const st = useWorkbay();
  const m = st.machine;
  const fmt = useFmt();
  const [tp, setTp] = useState(m.def.testPoints[0]?.id ?? '');
  const [gaugeId, setGaugeId] = useState('g-250');
  const [tach, setTach] = useState<'engine' | 'pto' | 'pump'>('pump');
  const [circuit, setCircuit] = useState(m.def.electrical[0]?.id ?? '');
  const [meterMode, setMeterMode] = useState<MeterMode>('voltage');
  const [irTarget, setIrTarget] = useState(m.def.pump);
  const [sample, setSample] = useState<FluidSampleResult | null>(null);
  const [driftOn, setDriftOn] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const ft = readFlowTester(m);

  const gaugeReadings = st.gauges.map((g) => {
    const r = readGauge(m, g.testPoint, g.gauge);
    if (r.damaged && !g.damaged) queueMicrotask(() => st.markGaugeDamaged(g.testPoint));
    return { g, r };
  });

  const installTester = () => {
    if (m.controls.engineRunning || !m.isDepressurised()) {
      setMsg('Shut the engine down, relieve trapped pressure and verify 0 bar before breaking into the pressure line.');
      return;
    }
    m.disconnect(m.def.flowTestConnection, true);
    const r = m.installFlowTester();
    setMsg(r.message);
    st.session?.record('test', 'flow-test', 'Installed in-line flow tester');
    st.bump();
  };
  const removeTester = () => {
    if (m.controls.engineRunning || !m.isDepressurised()) {
      setMsg('Shut down and depressurise before removing the tester.');
      return;
    }
    setMsg(m.removeFlowTester().message);
    st.bump();
  };

  const meter = circuit ? readMultimeter(m, circuit, meterMode) : null;
  const sight = readSightGlass(m);
  const drift = st.drift.read(m, m.body?.cfg.cylinder ?? 'cyl');

  return (
    <Panel title="Diagnostic instruments" icon={<Activity size={14} />}>
      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
        <div className={s.tool}>
          <div className={s.toolHead}>
            <GaugeIcon size={15} /> Pressure gauges
          </div>
          <div className={s.toolRow}>
            <Select value={tp} onChange={(e) => setTp(e.target.value)} options={m.def.testPoints.map((t) => ({ value: t.id, label: t.label }))} aria-label="Test point" />
            <Select value={gaugeId} onChange={(e) => setGaugeId(e.target.value)} options={GAUGES.map((g) => ({ value: g.id, label: g.label }))} aria-label="Gauge" />
          </div>
          <div className={s.toolRow}>
            <Button size="sm" variant="primary" onClick={() => st.installGauge(tp, gaugeId)}>
              Install at test point
            </Button>
            {st.gauges.some((g) => g.testPoint === tp) && (
              <Button size="sm" onClick={() => st.removeGauge(tp)}>
                Remove
              </Button>
            )}
          </div>
          <div className={s.small}>{m.def.testPoints.find((t) => t.id === tp)?.coupling}</div>
          {gaugeReadings.length > 0 && (
            <div className={s.gauges}>
              {gaugeReadings.map(({ g, r }) => (
                <div key={g.testPoint} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <Gauge value={g.damaged ? 0 : r.value} min={g.gauge.min} max={g.gauge.range} label={g.testPoint} sub={g.gauge.label.split(' ')[0]} warnAbove={g.gauge.range * 0.9} pegged={r.pegged} damaged={g.damaged} size={compact ? 118 : 128} />
                  <Button size="sm" onClick={() => st.addMeasurement('Gauge', g.testPoint, g.damaged ? 'gauge damaged' : fmt(r.value, 'pressure'), `gauge:${g.testPoint}`)} disabled={g.damaged}>
                    Record
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={s.tool}>
          <div className={s.toolHead}>
            <Droplet size={15} /> In-line flow tester
            {ft && <Badge tone="info">installed</Badge>}
          </div>
          {!ft ? (
            <>
              <div className={s.small}>Installs in the pump pressure line ({m.circuit.connections.find((c) => c.id === m.def.flowTestConnection)?.label ?? 'pressure line'}). Requires shutdown and verified zero pressure.</div>
              <Button size="sm" onClick={installTester}>
                Install flow tester
              </Button>
            </>
          ) : (
            <>
              <div className={s.statusGrid}>
                <div>
                  <div className={s.small}>Flow</div>
                  <div className={s.reading}>{fmt(ft.flow, 'flow')}</div>
                </div>
                <div>
                  <div className={s.small}>Pressure</div>
                  <div className={s.reading}>{fmt(ft.pressure, 'pressure')}</div>
                </div>
                <div>
                  <div className={s.small}>Temp</div>
                  <div className={s.reading}>{fmt(ft.temperature, 'temperature')}</div>
                </div>
              </div>
              <Range label="Load valve (close slowly – watch pressure)" value={ft.load} min={0} max={0.97} step={0.005} onChange={(v) => setFlowTesterLoad(m, v)} display={`${Math.round(ft.load * 100)} % closed`} />
              <div className={s.toolRow}>
                <Button size="sm" onClick={() => st.addMeasurement('Flow tester', `${fmt(ft.pressure, 'pressure')} / ${fmt(ft.temperature, 'temperature')} / pump ${fmt(readTach(m, 'pump'), 'rpm')}`, fmt(ft.flow, 'flow'), 'flow-test')}>
                  Record point
                </Button>
                <Button size="sm" onClick={removeTester}>
                  Remove tester
                </Button>
              </div>
            </>
          )}
        </div>

        <div className={s.tool}>
          <div className={s.toolHead}>
            <Timer size={15} /> Photo tachometer
          </div>
          <div className={s.toolRow}>
            <Select value={tach} onChange={(e) => setTach(e.target.value as typeof tach)} options={[{ value: 'engine', label: 'Engine crank pulley' }, { value: 'pto', label: 'PTO output flange' }, { value: 'pump', label: 'Pump shaft / coupling' }]} aria-label="Tachometer target" />
          </div>
          <div className={s.reading}>{fmt(readTach(m, tach), 'rpm')}</div>
          <Button size="sm" onClick={() => st.addMeasurement('Tachometer', tach, fmt(readTach(m, tach), 'rpm'), `tach:${tach}`)}>
            Record
          </Button>
        </div>

        <div className={s.tool}>
          <div className={s.toolHead}>
            <Zap size={15} /> Multimeter
          </div>
          <div className={s.toolRow}>
            <Select value={circuit} onChange={(e) => setCircuit(e.target.value)} options={m.def.electrical.map((e) => ({ value: e.id, label: e.label }))} aria-label="Circuit" />
            <Select value={meterMode} onChange={(e) => setMeterMode(e.target.value as MeterMode)} options={[{ value: 'voltage', label: 'DC volts (back-probe)' }, { value: 'resistance', label: 'Ohms (unplugged)' }]} aria-label="Meter mode" />
          </div>
          {meter && (
            <>
              <div className={s.reading}>{meter.display}</div>
              <div className={s.small}>{meter.note}</div>
              <Button size="sm" disabled={!meter.valid} onClick={() => st.addMeasurement('Multimeter', `${circuit} ${meterMode}`, meter.display, `meter:${circuit}:${meterMode}`)}>
                Record
              </Button>
            </>
          )}
        </div>

        <div className={s.tool}>
          <div className={s.toolHead}>
            <Thermometer size={15} /> IR thermometer
          </div>
          <Select value={irTarget} onChange={(e) => setIrTarget(e.target.value)} options={m.circuit.components.filter((c) => c.type !== 'open-port').map((c) => ({ value: c.id, label: c.label }))} aria-label="IR target" />
          <div className={s.reading}>{fmt(readIrTemperature(m, irTarget), 'temperature')}</div>
          <Button size="sm" onClick={() => st.addMeasurement('IR thermometer', irTarget, fmt(readIrTemperature(m, irTarget), 'temperature'), `ir:${irTarget}`)}>
            Record
          </Button>
        </div>

        <div className={s.tool}>
          <div className={s.toolHead}>
            <Eye size={15} /> Reservoir sight glass
          </div>
          <div className={s.reading}>{Math.round(sight.level * 100)} % {sight.belowMin ? '– BELOW MIN' : ''}</div>
          <div className={s.small}>{m.bodyAngle() > 1 ? 'Body is raised – level reads low because oil is in the cylinder. Check with the body DOWN.' : 'Body lowered – valid level check.'}</div>
          <Button size="sm" onClick={() => st.addMeasurement('Sight glass', 'reservoir', `${Math.round(sight.level * 100)} %${sight.foamy ? ' foamy' : ''}${m.bodyAngle() > 1 ? ' (body raised)' : ''}`, 'sight-glass')}>
            Record
          </Button>
        </div>

        <div className={s.tool}>
          <div className={s.toolHead}>
            <FlaskRound size={15} /> Fluid sample kit
          </div>
          <Button
            size="sm"
            onClick={() => {
              const r = takeFluidSample(m);
              setSample(r);
              st.addMeasurement('Fluid sample', 'reservoir', `ISO ${r.isoCode}, ${r.appearance.join('; ')}`, 'fluid-sample');
            }}
          >
            Take sample (vacuum pump, mid-tank)
          </Button>
          {sample && (
            <div className={s.small} style={{ color: 'var(--text-2)' }}>
              ISO 4406 {sample.isoCode} · water {Math.round(sample.waterPpm)} ppm · ν40 {sample.viscosity40.toFixed(0)} cSt (spec {sample.specifiedViscosity40.toFixed(0)}) · wear debris {sample.wearDebris} · aeration {sample.aeration}
              <br />
              {sample.appearance.join(' · ')}
            </div>
          )}
        </div>

        <div className={s.tool}>
          <div className={s.toolHead}>
            <Ruler size={15} /> Drift test (tape on stage)
          </div>
          {!driftOn ? (
            <Button
              size="sm"
              onClick={() => {
                st.drift.begin(m, m.body?.cfg.cylinder ?? 'cyl');
                setDriftOn(true);
              }}
            >
              Mark position & start timer
            </Button>
          ) : (
            <>
              <div className={s.reading}>{drift ? `${drift.rateMmPerMin.toFixed(1)} mm/min` : '–'}</div>
              <div className={s.small}>{drift ? `${drift.displacementMm.toFixed(1)} mm in ${drift.elapsed.toFixed(0)} s (negative = settling)` : ''}</div>
              <Button
                size="sm"
                onClick={() => {
                  if (drift) st.addMeasurement('Drift test', `${drift.elapsed.toFixed(0)} s`, `${drift.rateMmPerMin.toFixed(1)} mm/min`, 'drift-test');
                  setDriftOn(false);
                }}
              >
                Record & stop
              </Button>
            </>
          )}
        </div>
      </div>
      {msg && (
        <div style={{ marginTop: 8 }}>
          <Callout tone="warn">{msg}</Callout>
        </div>
      )}
    </Panel>
  );
}

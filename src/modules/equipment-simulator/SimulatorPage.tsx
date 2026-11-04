import { useState } from 'react';
import { Box, Network, Columns2, Droplets, Gauge as GaugeIcon, Eye, Layers } from 'lucide-react';
import { useWorkbay } from '@/stores/workbay';
import { useTick } from '@/stores/simLoop';
import { inspectionFor } from '@/equipment/registry';
import { DumpTruck3D, type VizMode } from '@/visualization/equipment/DumpTruck3D';
import { Schematic } from '@/visualization/schematics/Schematic';
import { OperatorControls } from '@/components/equipment/OperatorControls';
import { InstrumentsPanel } from '@/components/equipment/InstrumentsPanel';
import { InspectionPanel } from '@/components/equipment/InspectionPanel';
import { EventLog, StatusPanel } from '@/components/equipment/StatusPanel';
import { FaultInjector } from '@/components/equipment/FaultInjector';
import { TimeControls } from '@/components/equipment/TimeControls';
import { Badge, Button, Callout } from '@/components/ui';
import { useFmt } from '@/components/equipment/useQ';
import { readGauge } from '@/simulation/sensors/instruments';
import { LiveCutaways } from './LiveCutaways';
import p from '../shared/page.module.css';

type View = '3d' | 'schematic' | 'split';

export default function SimulatorPage() {
  const tick = useTick();
  const st = useWorkbay();
  const m = st.machine;
  const [view, setView] = useState<View>('3d');
  const [viz, setViz] = useState<VizMode>('flow');
  const [point, setPoint] = useState<string | null>(null);
  const [cutaways, setCutaways] = useState(false);
  const [zone, setZone] = useState<string>('all');
  const fmt = useFmt();
  const points = inspectionFor(st.profile).filter((ip) => zone === 'all' || ip.zone === zone);
  const getMachine = () => useWorkbay.getState().machine;
  const readings = st.gauges.map((g) => {
    const tp = m.def.testPoints.find((t) => t.id === g.testPoint)!;
    return { component: tp.component, port: tp.port, text: `${g.testPoint} ${g.damaged ? 'DMG' : fmt(readGauge(m, g.testPoint, g.gauge).value, 'pressure')}` };
  });
  const schematic = <Schematic circuit={m.sim.def} sim={m.sim} tick={tick} mode={viz === 'pressure' ? 'pressure' : viz === 'flow' ? 'flow' : 'static'} testPoints={m.def.testPoints} readings={readings} ariaLabel="Live hydraulic schematic" />;
  const three = <DumpTruck3D key={`${st.profile.id}-${m.circuit.connections.length}`} getMachine={getMachine} points={points} selectedPoint={point} onSelectPoint={setPoint} mode={viz} />;
  return (
    <div className={p.page}>
      <div className={p.head}>
        <div className={p.grow}>
          <h1>{st.profile.manufacturer} – {st.profile.name}</h1>
          <p>Operate the equipment, observe flow and pressure, inspect components and run diagnostic tests. Everything shown is computed by the hydraulic simulation engine.</p>
        </div>
        <TimeControls />
      </div>
      {st.session && (
        <Callout tone="warn" title={`Diagnostic scenario active: ${st.session.brief.title}`}>
          Customer complaint: “{st.session.brief.complaint}” – your actions here are recorded for the Diagnostic Center.
        </Callout>
      )}
      <div className={p.split}>
        <div className={p.stack}>
          <div className={`${p.viewport} ${p.viewportTall}`}>
            {view === '3d' && three}
            {view === 'schematic' && schematic}
            {view === 'split' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', height: '100%' }}>
                <div style={{ borderRight: '1px solid var(--border)' }}>{three}</div>
                {schematic}
              </div>
            )}
            <div className={p.overlay}>
              <Button size="sm" active={view === '3d'} onClick={() => setView('3d')}>
                <Box size={13} /> 3D
              </Button>
              <Button size="sm" active={view === 'schematic'} onClick={() => setView('schematic')}>
                <Network size={13} /> Schematic
              </Button>
              <Button size="sm" active={view === 'split'} onClick={() => setView('split')}>
                <Columns2 size={13} /> Split
              </Button>
              <span style={{ width: 8 }} />
              <Button size="sm" active={viz === 'normal'} onClick={() => setViz('normal')} title="Normal view">
                <Eye size={13} /> Normal
              </Button>
              <Button size="sm" active={viz === 'flow'} onClick={() => setViz('flow')} title="Fluid flow mode">
                <Droplets size={13} /> Fluid flow
              </Button>
              <Button size="sm" active={viz === 'pressure'} onClick={() => setViz('pressure')} title="Pressure mode">
                <GaugeIcon size={13} /> Pressure
              </Button>
              <Button size="sm" active={cutaways} onClick={() => setCutaways(!cutaways)} title="Cutaway mode">
                <Layers size={13} /> Cutaways
              </Button>
              <span style={{ flex: 1 }} />
              {view !== 'schematic' && (
                <select value={zone} onChange={(e) => setZone(e.target.value)} aria-label="Inspection zone" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 4, height: 26, fontSize: 12 }}>
                  <option value="all">All inspection zones</option>
                  <option value="engine">Engine compartment</option>
                  <option value="hydraulic">Hydraulic system</option>
                  <option value="body">Dump body</option>
                  <option value="controls">Controls</option>
                </select>
              )}
              {m.disconnected.size > 0 && <Badge tone="warn">{m.disconnected.size} line(s) open</Badge>}
            </div>
          </div>
          {cutaways && <LiveCutaways />}
          <div className={p.cols2}>
            <InspectionPanel pointId={point} onClose={() => setPoint(null)} />
            <EventLog />
          </div>
          <InstrumentsPanel />
        </div>
        <div className={p.stack}>
          <OperatorControls />
          <StatusPanel />
          <FaultInjector />
        </div>
      </div>
    </div>
  );
}

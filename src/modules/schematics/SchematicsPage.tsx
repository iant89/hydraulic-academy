import { useMemo, useState } from 'react';
import { useWorkbay } from '@/stores/workbay';
import { useTick } from '@/stores/simLoop';
import { Schematic, LINE_COLORS, LINE_LABELS, type Selection } from '@/visualization/schematics/Schematic';
import { getModel } from '@/simulation/components/registry';
import { basicCylinderCircuit } from '@/simulation/circuits/library';
import { EXERCISES } from '@/data/exercises';
import { EXPERIMENTS } from '@/data/labs';
import { BUILTIN_PROFILES } from '@/data/equipment/profiles';
import { machineFromProfile } from '@/equipment/registry';
import type { CircuitDefinition, LineType } from '@/simulation/hydraulics/types';
import { Badge, Button, Callout, KV, Panel, Select, Tabs } from '@/components/ui';
import { useFmt } from '@/components/equipment/useQ';
import p from '../shared/page.module.css';

type Tab = 'live' | 'reference' | 'lines';

export default function SchematicsPage() {
  const [tab, setTab] = useState<Tab>('live');
  return (
    <div className={p.page}>
      <div className={p.head}>
        <div className={p.grow}>
          <h1>Hydraulic Schematics</h1>
          <p>Read circuits the way they are drawn in service documentation. The live schematic is generated from the same circuit model the simulation runs, and highlights active flow paths and component states during operation.</p>
        </div>
      </div>
      <Tabs<Tab> tabs={[{ id: 'live', label: 'Live equipment schematic' }, { id: 'reference', label: 'Reference circuits' }, { id: 'lines', label: 'Line identification' }]} value={tab} onChange={setTab} />
      {tab === 'live' && <Live />}
      {tab === 'reference' && <Reference />}
      {tab === 'lines' && <Lines />}
    </div>
  );
}

function Live() {
  const tick = useTick();
  const m = useWorkbay((s) => s.machine);
  const [mode, setMode] = useState<'flow' | 'pressure' | 'static'>('flow');
  const [sel, setSel] = useState<Selection>(null);
  const fmt = useFmt();
  const comp = sel?.kind === 'component' ? m.sim.def.components.find((c) => c.id === sel.id) : undefined;
  const cn = sel?.kind === 'connection' ? m.sim.def.connections.find((c) => c.id === sel.id) : undefined;
  return (
    <div className={p.split}>
      <div className={p.stack}>
        <div className={p.row}>
          {(['flow', 'pressure', 'static'] as const).map((x) => (
            <Button key={x} size="sm" active={mode === x} onClick={() => setMode(x)}>
              {x === 'flow' ? 'Active flow paths' : x === 'pressure' ? 'Pressure map' : 'Static'}
            </Button>
          ))}
          <span className={p.small}>Operate the equipment in the Equipment Simulator – this view updates live.</span>
        </div>
        <div className={`${p.viewport} ${p.viewportTall}`}>
          <Schematic circuit={m.sim.def} sim={m.sim} tick={tick} mode={mode} selected={sel} onSelect={setSel} testPoints={m.def.testPoints} />
        </div>
      </div>
      <Panel title={comp ? comp.label : cn ? cn.label ?? cn.id : 'Selection'}>
        {!comp && !cn && <div className={p.small}>Click a symbol or a line for details.</div>}
        {comp && (
          <div className={p.list}>
            <Badge>{getModel(comp.type).name}</Badge>
            <div className={p.small}>{getModel(comp.type).summary}</div>
            <KV items={m.sim.readouts(comp.id).map((r) => [r.label, typeof r.value === 'number' ? fmt(r.value, r.quantity ?? 'none') : String(r.value)])} />
            <KV items={getModel(comp.type).ports(comp).map((pt) => [`Port ${pt.marking}`, pt.label])} />
          </div>
        )}
        {cn && (
          <KV
            items={[
              ['Function', LINE_LABELS[cn.lineType]],
              ['From', `${cn.from.component}.${cn.from.port}`],
              ['To', `${cn.to.component}.${cn.to.port}`],
              ['Hose ID', `${(cn.hose.innerDiameter * 1000).toFixed(1)} mm`],
              ['Rating', fmt(cn.hose.workingPressure, 'pressure')],
              ['Flow now', fmt(m.sim.flowThrough(cn.id), 'flow')],
              ['Pressure (from end)', fmt(m.sim.pressureAt(cn.from.component, cn.from.port), 'pressure')],
            ]}
          />
        )}
      </Panel>
    </div>
  );
}

function Reference() {
  const options = useMemo(() => {
    const o: { value: string; label: string; c: () => CircuitDefinition }[] = [];
    for (const pr of BUILTIN_PROFILES) o.push({ value: `profile:${pr.id}`, label: `Equipment – ${pr.name}`, c: () => machineFromProfile(pr).circuit });
    o.push({ value: 'basic', label: 'Basic double-acting cylinder circuit', c: basicCylinderCircuit });
    for (const e of EXERCISES) o.push({ value: `ex:${e.id}`, label: `Exercise solution – ${e.title}`, c: () => ({ ...e.start(), connections: e.reference() }) });
    for (const e of EXPERIMENTS) o.push({ value: `exp:${e.id}`, label: `Experiment – ${e.title}`, c: e.circuit });
    return o;
  }, []);
  const [v, setV] = useState(options[0]!.value);
  const circuit = options.find((o) => o.value === v)!.c();
  return (
    <div className={p.stack}>
      <div style={{ maxWidth: 520 }}>
        <Select value={v} onChange={(e) => setV(e.target.value)} options={options} aria-label="Circuit" />
      </div>
      <div className={`${p.viewport} ${p.viewportTall}`}>
        <Schematic circuit={circuit} mode="static" />
      </div>
    </div>
  );
}

function Lines() {
  const desc: Record<LineType, string> = {
    suction: 'Reservoir S port → pump inlet. Large bore, low velocity, wire-helix hose. Under vacuum – any leak draws in air.',
    pressure: 'Pump outlet → valve P and relief P. Carries full system pressure.',
    work: 'Valve A/B → actuator ports. Pressure depends on direction and load; one side is pressure, the other return.',
    return: 'Valve T, relief T → filter → cooler → reservoir R. Low pressure; restriction here causes back-pressure.',
    pilot: 'Small lines carrying control signals to pilot-operated valves (counterbalance X, pilot checks).',
    'case-drain': 'Pump/motor case → reservoir D port, direct and unrestricted.',
    'load-sense': 'Highest work-port pressure signal to a load-sensing pump or compensator.',
  };
  return (
    <div className={p.cols2}>
      <Panel title="Line functions">
        <div className={p.list}>
          {(Object.keys(LINE_LABELS) as LineType[]).map((k) => (
            <div key={k} style={{ display: 'flex', gap: 10 }}>
              <span style={{ width: 28, height: 4, marginTop: 8, background: LINE_COLORS[k], borderRadius: 2, flex: 'none' }} />
              <div>
                <strong>{LINE_LABELS[k]}</strong>
                <div className={p.small}>{desc[k]}</div>
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <div className={p.stack}>
        <Callout tone="danger" title="Never identify lines by hose colour">
          The colours here are a teaching aid inside this application only. Real hoses are rarely colour-coded, and tags and colours are often wrong after previous repairs. Identify every line by tracing it to the stamped port markings on the components and comparing with the equipment manufacturer’s schematic.
        </Callout>
        <Callout title="Reading port markings">
          P – pressure inlet · T (or R) – tank/return · A, B – work ports · L / D / CD – case drain · X, Y – pilot / spring-chamber drain · LS – load sense · S – suction. Always confirm against the manufacturer’s port identification, which can differ.
        </Callout>
      </div>
    </div>
  );
}

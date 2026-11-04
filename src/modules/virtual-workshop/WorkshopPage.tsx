import { useMemo, useState } from 'react';
import { ClipboardCheck, Hammer, Layers, ScanSearch } from 'lucide-react';
import { useWorkbay } from '@/stores/workbay';
import { useTick } from '@/stores/simLoop';
import { useTraining } from '@/stores/training';
import { assembliesFor, inspectionFor } from '@/equipment/registry';
import { observe } from '@/simulation/scenarios/observations';
import { Equipment3D } from '@/visualization/equipment/Equipment3D';
import { WorkshopProps } from '@/visualization/equipment/WorkshopProps';
import { Schematic } from '@/visualization/schematics/Schematic';
import { InspectionPanel } from '@/components/equipment/InspectionPanel';
import { SafetyStatus } from '@/components/equipment/SafetyStatus';
import { Badge, Button, Callout, Panel, Tabs, TextInput, tableClass } from '@/components/ui';
import { CylinderCutaway, GearPumpCutaway, PtoCutaway, ReliefCutaway, SpoolValveCutaway } from '@/visualization/cutaways/Cutaways';
import { href } from '@/app/router';
import { newId } from '@/services/training/records';
import p from '../shared/page.module.css';

type Mode = 'inspect' | 'isolate' | 'tools';
type Finding = { status: 'ok' | 'defect'; note: string };

export default function WorkshopPage() {
  useTick();
  const st = useWorkbay();
  const m = st.machine;
  const [mode, setMode] = useState<Mode>('inspect');
  const [point, setPoint] = useState<string | null>(null);
  const points = inspectionFor(st.profile);
  return (
    <div className={p.page}>
      <div className={p.head}>
        <div className={p.grow}>
          <h1>Virtual Workshop – Bay 1 · {st.profile.name}</h1>
          <p>Inspect the equipment systematically, isolate assemblies for close examination, and use the workshop tools. Repairs are carried out in the Repair Workshop on this same equipment.</p>
        </div>
        <a href={href('repair')}>
          <Button variant="primary">
            <Hammer size={14} /> Open repair procedures
          </Button>
        </a>
      </div>
      <div className={p.split}>
        <div className={p.stack}>
          <div className={`${p.viewport}`} style={{ height: 480 }}>
            <Equipment3D getMachine={() => useWorkbay.getState().machine} points={points} selectedPoint={point} onSelectPoint={setPoint} mode="normal" environment="workshop">
              <WorkshopProps />
            </Equipment3D>
          </div>
          <Tabs<Mode>
            tabs={[
              { id: 'inspect', label: 'Inspection mode' },
              { id: 'isolate', label: 'Component isolation' },
              { id: 'tools', label: 'Tool inventory' },
            ]}
            value={mode}
            onChange={setMode}
          />
          {mode === 'inspect' && <InspectionMode point={point} setPoint={setPoint} />}
          {mode === 'isolate' && <Isolation />}
          {mode === 'tools' && <Tools />}
        </div>
        <div className={p.stack}>
          <InspectionPanel pointId={point} onClose={() => setPoint(null)} />
          <SafetyStatus />
          {m.removed.size > 0 && (
            <Panel title="On the workbench">
              {[...m.removed.values()].map((c) => (
                <div key={c.id} className={p.small}>
                  {c.label} – removed for service
                </div>
              ))}
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function InspectionMode({ point, setPoint }: { point: string | null; setPoint(id: string): void }) {
  const st = useWorkbay();
  const m = st.machine;
  const addRecord = useTraining((s) => s.addRecord);
  const points = inspectionFor(st.profile);
  const [findings, setFindings] = useState<Record<string, Finding>>({});
  const [result, setResult] = useState<null | { found: string[]; missed: string[]; incorrect: string[]; safety: string[]; score: number }>(null);
  const set = (id: string, f: Partial<Finding>) => setFindings({ ...findings, [id]: { status: 'ok', note: '', ...findings[id], ...f } });

  const submit = async () => {
    // Ground truth: a point "has a defect" if any outstanding fault targets one of its items.
    const faults = m.faults.outstanding();
    const truth = (id: string) => {
      const ip = points.find((x) => x.id === id)!;
      const t = ip.targets;
      return faults.some((f) => t.components?.includes(f.spec.target) || t.connections?.includes(f.spec.target) || t.electrical?.includes(f.spec.target) || (t.pto && f.spec.target === 'pto')) || observe(m, t).some((o) => o.level >= 2);
    };
    const found: string[] = [];
    const missed: string[] = [];
    const incorrect: string[] = [];
    for (const ip of points) {
      const f = findings[ip.id];
      const bad = truth(ip.id);
      if (bad && f?.status === 'defect') found.push(ip.label);
      else if (bad) missed.push(ip.label);
      else if (f?.status === 'defect') incorrect.push(ip.label);
    }
    const safety: string[] = [];
    if (m.body && m.bodyAngle() > 1 && !m.safety.bodyPropInstalled) safety.push('Inspected with the body raised and not propped.');
    if (m.crane && m.craneState()?.loadSuspended) safety.push('Inspected with a load suspended from the crane.');
    if (m.controls.engineRunning && !m.controls.parkingBrake) safety.push('Engine running without the parking brake set.');
    const inspected = Object.keys(findings).length;
    const score = Math.round(Math.max(0, (found.length * 2 + (inspected / points.length) * 4 - missed.length * 2 - incorrect.length - safety.length * 2) / (Math.max(1, found.length + missed.length) * 2 + 4)) * 100);
    setResult({ found, missed, incorrect, safety, score });
    await addRecord({ id: newId('insp'), type: 'exercise', refId: 'inspection', title: 'Equipment inspection', date: new Date().toISOString(), score, passed: missed.length === 0 && safety.length === 0, mistakes: [...missed.map((x) => `Missed defect: ${x}`), ...incorrect.map((x) => `Incorrect conclusion: ${x}`), ...safety] });
  };

  return (
    <Panel title="Structured inspection" icon={<ClipboardCheck size={14} />} actions={<Button size="sm" variant="primary" onClick={submit}>Submit inspection</Button>}>
      <Callout tone="info">Inspect every point (operate the equipment where evidence only appears under pressure), then record OK or DEFECT with a note. Use cardboard – never your hands – to locate high-pressure leaks.</Callout>
      <div className="tableWrap" style={{ marginTop: 8 }}>
        <table className={tableClass}>
          <thead>
            <tr>
              <th>Point</th>
              <th>Zone</th>
              <th>Finding</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {points.map((ip) => (
              <tr key={ip.id} style={{ background: point === ip.id ? 'rgba(242,169,59,0.06)' : undefined }}>
                <td>
                  <button className={p.item} style={{ padding: '2px 6px', width: 'auto' }} onClick={() => setPoint(ip.id)}>
                    {ip.label}
                  </button>
                </td>
                <td className={p.small}>{ip.zone}</td>
                <td>
                  <div className={p.row}>
                    <Button size="sm" active={findings[ip.id]?.status === 'ok'} onClick={() => set(ip.id, { status: 'ok' })}>
                      OK
                    </Button>
                    <Button size="sm" active={findings[ip.id]?.status === 'defect'} onClick={() => set(ip.id, { status: 'defect' })}>
                      Defect
                    </Button>
                  </div>
                </td>
                <td>
                  <TextInput value={findings[ip.id]?.note ?? ''} onChange={(e) => set(ip.id, { note: e.target.value })} placeholder="Observation" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result && (
        <div style={{ marginTop: 8 }}>
          <Callout tone={result.missed.length || result.safety.length ? 'warn' : 'ok'} title={`Inspection score ${result.score}`}>
            <div>Defects found: {result.found.join(', ') || 'none'}</div>
            <div>Defects missed: {result.missed.join(', ') || 'none'}</div>
            <div>Incorrect conclusions: {result.incorrect.join(', ') || 'none'}</div>
            <div>Safety: {result.safety.join(' ') || 'compliant'}</div>
          </Callout>
        </div>
      )}
    </Panel>
  );
}

function Isolation() {
  const tick = useTick();
  const { machine: m, profile } = useWorkbay();
  const assemblies = assembliesFor(profile);
  const [asm, setAsm] = useState(assemblies[0]?.id ?? '');
  const a = assemblies.find((x) => x.id === asm) ?? assemblies[0]!;
  const sub = useMemo(() => {
    const def = m.sim.def;
    const all = a.components.length === 0;
    const comps = def.components.filter((c) => all || a.components.includes(c.id));
    const ids = new Set(comps.map((c) => c.id));
    const conns = def.connections.filter((c) => (a.connections.length ? a.connections.includes(c.id) : true) && ids.has(c.from.component) && ids.has(c.to.component));
    return { ...def, name: a.label, components: comps, connections: conns };
  }, [m.sim.def, a]);
  const sim = m.sim;
  const inAsm = sub.components;
  return (
    <Panel title="Component isolation" icon={<Layers size={14} />}>
      <div className={p.row} style={{ marginBottom: 8 }}>
        {assemblies.map((x) => (
          <Button key={x.id} size="sm" active={asm === x.id} onClick={() => setAsm(x.id)}>
            {x.label}
          </Button>
        ))}
      </div>
      <div className={p.cols2}>
        <div style={{ height: 320 }}>
          <Schematic circuit={sub} sim={sim} tick={tick} />
        </div>
        <div className={p.list}>
          {inAsm.some((c) => c.id === m.def.pump) && (
            <>
              <PtoCutaway engaged={m.pto.state === 'engaged'} rpm={m.pto.outputRpm} />
              <GearPumpCutaway rpm={sim.getInput(m.def.pump, 'speed')} cavitating={sim.readout(m.def.pump, 'cavitating') === 1} />
            </>
          )}
          {inAsm.filter((c) => c.type === 'dcv').slice(0, 2).map((c) => <SpoolValveCutaway key={c.id} spool={sim.readout(c.id, 'spool')} four={String(c.params.variant).startsWith('4')} />)}
          {inAsm.filter((c) => c.type === 'relief-valve').map((c) => <ReliefCutaway key={c.id} opening={sim.readout(c.id, 'opening')} pressure={sim.readout(c.id, 'inlet')} setting={m.effectiveSetting(c.id)} />)}
          {a.components.length > 0 && inAsm.filter((c) => c.type === 'cylinder').map((c) => <CylinderCutaway key={c.id} extension={sim.readout(c.id, 'extension')} stages={Array.isArray(c.params.stages) ? (c.params.stages as number[]).length : 1} single={c.params.singleActing === true} pressure={sim.pressureAt(c.id, 'A')} />)}
          {a.components.length === 0 && <div className={p.small}>Trace each line from port to port. Lines are identified by port markings and the schematic – never by hose colour.</div>}
          {a.components.map((id) => {
            const c = m.circuit.components.find((x) => x.id === id);
            return c ? (
              <a key={id} href={href(`repair?target=component:${id}`)} className={p.small}>
                Service procedures – {c.label}
              </a>
            ) : null;
          })}
        </div>
      </div>
    </Panel>
  );
}

const TOOLS = [
  { name: 'Combination wrenches / line wrenches', use: 'Disconnect and reconnect hydraulic fittings without rounding flats.', link: 'repair' },
  { name: 'Socket set', use: 'Mounting bolts for pump, valve and cylinder caps.', link: 'repair' },
  { name: 'Torque wrench', use: 'Final torque on fittings and fasteners. Requires a verified specification – the workshop will not supply invented values.', link: 'repair' },
  { name: 'Pressure gauges (compound, 60, 250, 400, 600 bar)', use: 'Fit at test points. Choose a range above the maximum expected pressure.', link: 'diagnostics' },
  { name: 'In-line flow tester with load valve', use: 'Pump flow vs. pressure test – installed in the pump pressure line.', link: 'simulator' },
  { name: 'Temperature probe / IR thermometer', use: 'Locate heat sources (relief bypassing, restrictions) without touching hot surfaces.', link: 'simulator' },
  { name: 'Digital multimeter', use: 'Voltage at solenoid connectors (circuit live) and coil resistance (unplugged).', link: 'simulator' },
  { name: 'Cardboard / leak detection card', use: 'Safely locate pin-hole leaks. NEVER use hands.', link: 'workshop' },
  { name: 'Fluid sampling kit (vacuum pump, bottles)', use: 'Particle count, water, viscosity and wear debris.', link: 'simulator' },
  { name: 'Lockout/tagout kit & body prop', use: 'Isolation of energy sources and mechanical support of the raised body.', link: 'repair' },
];

function Tools() {
  return (
    <Panel title="Tool inventory" icon={<ScanSearch size={14} />}>
      <table className={tableClass}>
        <thead>
          <tr>
            <th>Tool</th>
            <th>Contextual function</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {TOOLS.map((t) => (
            <tr key={t.name}>
              <td>{t.name}</td>
              <td className={p.small}>{t.use}</td>
              <td>
                <a href={href(t.link)}>
                  <Badge tone="info">use</Badge>
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

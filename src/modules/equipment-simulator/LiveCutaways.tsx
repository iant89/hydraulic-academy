import { useWorkbay } from '@/stores/workbay';
import { useTick } from '@/stores/simLoop';
import { Panel } from '@/components/ui';
import { CylinderCutaway, GearPumpCutaway, PtoCutaway, ReliefCutaway, SpoolValveCutaway } from '@/visualization/cutaways/Cutaways';

/** Cutaway mode: component internals driven by the live simulation state. */
export function LiveCutaways() {
  useTick();
  const m = useWorkbay((s) => s.machine);
  const sim = m.sim;
  const has = (id: string) => sim.components.has(id);
  const cyl = m.body?.cfg.cylinder ?? 'cyl';
  return (
    <Panel title="Component cutaways (live)">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        <figure style={{ margin: 0 }}>
          <PtoCutaway engaged={m.pto.state === 'engaged'} rpm={m.pto.outputRpm} />
          <figcaption style={{ fontSize: 12, color: 'var(--muted)' }}>PTO drive</figcaption>
        </figure>
        {has(m.def.pump) && (
          <figure style={{ margin: 0 }}>
            <GearPumpCutaway rpm={sim.getInput(m.def.pump, 'speed')} cavitating={sim.readout(m.def.pump, 'cavitating') === 1} label={false} />
            <figcaption style={{ fontSize: 12, color: 'var(--muted)' }}>Gear pump</figcaption>
          </figure>
        )}
        {has(m.def.hoistValve) && (
          <figure style={{ margin: 0 }}>
            <SpoolValveCutaway spool={sim.readout(m.def.hoistValve, 'spool')} four={String(m.circuit.components.find((c) => c.id === m.def.hoistValve)?.params.variant).startsWith('4')} />
            <figcaption style={{ fontSize: 12, color: 'var(--muted)' }}>Hoist valve spool</figcaption>
          </figure>
        )}
        {has(m.def.mainRelief) && (
          <figure style={{ margin: 0 }}>
            <ReliefCutaway opening={sim.readout(m.def.mainRelief, 'opening')} pressure={sim.readout(m.def.mainRelief, 'inlet')} setting={m.effectiveSetting(m.def.mainRelief)} />
            <figcaption style={{ fontSize: 12, color: 'var(--muted)' }}>Main relief valve</figcaption>
          </figure>
        )}
        {has(cyl) && (
          <figure style={{ margin: 0 }}>
            <CylinderCutaway extension={sim.readout(cyl, 'extension')} stages={Array.isArray(m.circuit.components.find((c) => c.id === cyl)?.params.stages) ? (m.circuit.components.find((c) => c.id === cyl)!.params.stages as number[]).length : 1} single pressure={sim.pressureAt(cyl, 'A')} leaking={(sim.leakRate[`${cyl}:bypass`] ?? 0) > 1e-6} />
            <figcaption style={{ fontSize: 12, color: 'var(--muted)' }}>Hoist cylinder</figcaption>
          </figure>
        )}
      </div>
    </Panel>
  );
}

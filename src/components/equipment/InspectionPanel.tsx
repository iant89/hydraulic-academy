import { useEffect } from 'react';
import { Ear, Eye, Hand, Wind, Lightbulb, Wrench } from 'lucide-react';
import { useWorkbay } from '@/stores/workbay';
import { useTick } from '@/stores/simLoop';
import { observe, type Sense } from '@/simulation/scenarios/observations';
import { getModel } from '@/simulation/components/registry';
import { partById } from '@/data/parts/catalog';
import { inspectionFor } from '@/equipment/registry';
import { Badge, Button, Callout, Empty, Panel } from '@/components/ui';
import { href } from '@/app/router';
import s from './equipment.module.css';

const SENSE_ICON: Record<Sense, typeof Eye> = { sight: Eye, sound: Ear, touch: Hand, smell: Wind, indicator: Lightbulb };

export function InspectionPanel({ pointId, onClose }: { pointId: string | null; onClose?(): void }) {
  useTick();
  const { machine: m, profile, session } = useWorkbay();
  const points = inspectionFor(profile);
  const ip = points.find((p) => p.id === pointId);
  useEffect(() => {
    if (ip) session?.record('observe', `inspect:${ip.id}`, `Inspected ${ip.label}`);
  }, [ip, session]);
  if (!ip) return <Panel title="Inspection"><Empty>Select an inspection point on the equipment (blue markers) to inspect it.</Empty></Panel>;
  const obs = observe(m, ip.targets);
  const comps = (ip.targets.components ?? []).map((id) => m.circuit.components.find((c) => c.id === id) ?? m.removed.get(id)).filter(Boolean);
  return (
    <Panel title={ip.label} actions={onClose && <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className={s.small}>{ip.description}</div>
        {ip.safety && <Callout tone="danger" title="Safety">{ip.safety}</Callout>}
        <div>
          <div className={s.small} style={{ marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Observations (current conditions)</div>
          {obs.map((o) => {
            const Icon = SENSE_ICON[o.sense];
            return (
              <div key={o.id} className={s.obs} data-level={o.level}>
                <Icon size={14} className={s.obsIcon} />
                <div>
                  {o.text}
                  {o.safety && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{o.safety}</div>}
                </div>
              </div>
            );
          })}
        </div>
        <div>
          <div className={s.small} style={{ marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Inspection checklist</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-2)' }}>
            {ip.checklist.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
        {comps.map((c) => {
          const model = getModel(c!.type);
          const part = c!.partId ? partById(c!.partId) : undefined;
          const conns = m.circuit.connections.filter((x) => x.from.component === c!.id || x.to.component === c!.id);
          return (
            <div key={c!.id} style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <strong>{c!.label}</strong>
                <Badge>{model.name}</Badge>
                {m.removed.has(c!.id) && <Badge tone="warn">removed</Badge>}
              </div>
              <div className={s.small} style={{ margin: '4px 0' }}>{model.summary}</div>
              <div className={s.small}>
                Manufacturer / model: {part ? `${part.manufacturer} – ${part.partNumber}` : 'Not recorded'} {part && <Badge tone="warn">simulated training part</Badge>}
              </div>
              <div className={s.small} style={{ marginTop: 4 }}>
                Ports:{' '}
                {model.ports(c!).map((p) => {
                  const cn = conns.find((x) => (x.from.component === c!.id && x.from.port === p.id) || (x.to.component === c!.id && x.to.port === p.id));
                  return (
                    <span key={p.id} style={{ marginRight: 10 }}>
                      <span className="mono" style={{ color: 'var(--accent)' }}>{p.marking}</span> {p.label}
                      {cn ? ` → ${cn.label}` : ' (not connected)'}
                    </span>
                  );
                })}
              </div>
              <div style={{ marginTop: 6 }}>
                <a href={href(`repair?target=component:${c!.id}`)}>
                  <Button size="sm">
                    <Wrench size={13} /> Service procedures
                  </Button>
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

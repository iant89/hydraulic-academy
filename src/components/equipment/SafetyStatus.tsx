import { CheckCircle2, ShieldAlert, XCircle } from 'lucide-react';
import { useWorkbay } from '@/stores/workbay';
import { useTick } from '@/stores/simLoop';
import { BAR } from '@/simulation/core/units';
import { Panel } from '@/components/ui';

export function SafetyStatus() {
  useTick();
  const m = useWorkbay((s) => s.machine);
  const items: [string, boolean][] = [
    ['Parking brake set', m.controls.parkingBrake],
    ['Wheels chocked', m.safety.wheelsChocked],
    ['Engine stopped', !m.controls.engineRunning],
    ['PTO switched off', !m.controls.ptoSwitch && m.pto.state === 'disengaged'],
    [m.securedLabel(), m.loadsSecured()],
    ['Lockout/tagout applied', m.safety.lotoApplied],
    [`Circuit at zero pressure (max ${(m.maxSystemPressure() / BAR).toFixed(1)} bar)`, m.isDepressurised()],
  ];
  const hazards = m.storedEnergyHazards();
  return (
    <Panel title="Isolation & stored energy" icon={<ShieldAlert size={14} />}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
        {items.map(([l, ok]) => (
          <div key={l} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {ok ? <CheckCircle2 size={14} color="var(--ok)" /> : <XCircle size={14} color="var(--danger)" />} {l}
          </div>
        ))}
        {hazards.length > 0 && (
          <div style={{ marginTop: 6, color: 'var(--warn)', fontSize: 12 }}>
            {hazards.map((h) => (
              <div key={h}>⚠ {h}</div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

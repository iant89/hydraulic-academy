import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Key, OctagonX, Power, PowerOff, RotateCcw } from 'lucide-react';
import { useWorkbay } from '@/stores/workbay';
import { useTick } from '@/stores/simLoop';
import { Badge, Button, Panel, Range } from '@/components/ui';
import { useFmt } from './useQ';
import s from './equipment.module.css';

/** Operator controls – every control acts on the live MachineSimulation. */
export function OperatorControls() {
  useTick();
  const m = useWorkbay((st) => st.machine);
  const session = useWorkbay((st) => st.session);
  const fmt = useFmt();
  const [latch, setLatch] = useState(false);
  const holding = useRef<-1 | 0 | 1>(0);
  const c = m.controls;
  const op = (id: string, detail: string) => session?.record('operate', id, detail);

  const hoist = (cmd: -1 | 0 | 1) => {
    holding.current = cmd;
    m.setHoist(cmd);
    if (cmd === 1) op('op:raise', 'Hoist RAISE');
    if (cmd === -1) op('op:lower', 'Hoist LOWER');
  };
  useEffect(() => {
    const up = () => {
      if (!latch && holding.current !== 0) hoist(0);
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  });
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
      if (e.repeat) return;
      if (e.key === 'r' || e.key === 'ArrowUp') hoist(1);
      if (e.key === 'l' || e.key === 'ArrowDown') hoist(-1);
      if (e.key === ' ') {
        e.preventDefault();
        m.setEmergencyStop(true);
      }
    };
    const keyUp = (e: KeyboardEvent) => {
      if (!latch && ['r', 'l', 'ArrowUp', 'ArrowDown'].includes(e.key)) hoist(0);
    };
    window.addEventListener('keydown', key);
    window.addEventListener('keyup', keyUp);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('keyup', keyUp);
    };
  });

  const rated = m.body?.cfg.ratedPayload ?? 0;
  return (
    <Panel title="Operator controls" actions={<Badge tone={m.pto.state === 'engaged' ? 'ok' : m.pto.state === 'engaging' ? 'warn' : undefined}>PTO {m.pto.state.toUpperCase()}</Badge>}>
      <div className={s.controls}>
        <div className={s.ctlRow}>
          <Button active={c.ignition} onClick={() => m.setIgnition(!c.ignition)} aria-pressed={c.ignition} title="Ignition key">
            <Key size={14} /> Key {c.ignition ? 'ON' : 'OFF'}
          </Button>
          {c.engineRunning ? (
            <Button onClick={() => { m.stopEngine(); op('op:stop', 'Engine stop'); }}>
              <PowerOff size={14} /> Stop engine
            </Button>
          ) : (
            <Button variant="primary" onClick={() => { m.startEngine(); op('op:start', 'Engine start'); }} disabled={c.emergencyStop}>
              <Power size={14} /> Start engine
            </Button>
          )}
        </div>
        <Range label={`Engine speed – ${fmt(m.engineRpm, 'rpm')}`} value={c.throttle} min={0} max={1} step={0.01} onChange={(v) => m.setThrottle(v)} display={`${Math.round(c.throttle * 100)} % throttle`} />
        <div className={s.ctlRow}>
          <Button active={c.parkingBrake} onClick={() => m.setParkingBrake(!c.parkingBrake)} aria-pressed={c.parkingBrake}>
            Parking brake {c.parkingBrake ? 'SET' : 'OFF'}
          </Button>
          <Button active={c.ptoSwitch} onClick={() => { m.setPtoSwitch(!c.ptoSwitch); op('op:pto', `PTO switch ${!c.ptoSwitch ? 'ON' : 'OFF'}`); }} aria-pressed={c.ptoSwitch}>
            <span className={s.lamp} data-on={m.pto.state === 'engaged'} /> PTO switch {c.ptoSwitch ? 'ON' : 'OFF'}
          </Button>
        </div>
        <div className={s.hoist}>
          <button className={s.hoistBtn} data-active={c.hoist === 1} onPointerDown={() => hoist(c.hoist === 1 && latch ? 0 : 1)} aria-label="Raise body (hold)">
            <ArrowUp size={18} /> RAISE
          </button>
          <button className={s.hoistBtn} data-active={c.hoist === 0} onPointerDown={() => hoist(0)} aria-label="Hold">
            HOLD
          </button>
          <button className={s.hoistBtn} data-active={c.hoist === -1} onPointerDown={() => hoist(c.hoist === -1 && latch ? 0 : -1)} aria-label="Lower body (hold)">
            <ArrowDown size={18} /> LOWER
          </button>
        </div>
        <label className={s.check}>
          <input type="checkbox" checked={latch} onChange={(e) => setLatch(e.target.checked)} /> Latch hoist switch (otherwise press-and-hold, keys R / L)
        </label>
        <div className={s.ctlRow}>
          <span className={s.small}>Payload</span>
          {[0, 0.5, 1].map((f) => (
            <Button key={f} size="sm" active={Math.abs((m.body?.payload ?? 0) - rated * f) < 50} onClick={() => m.setPayload(rated * f)} disabled={m.bodyAngle() > 1}>
              {f === 0 ? 'Empty' : f === 0.5 ? 'Half' : 'Rated'}
            </Button>
          ))}
          <span className={s.small}>{fmt(m.body?.payload ?? 0, 'mass')}</span>
        </div>
        <div className={s.ctlRow}>
          {c.emergencyStop ? (
            <Button onClick={() => m.setEmergencyStop(false)}>
              <RotateCcw size={14} /> Reset E-stop
            </Button>
          ) : (
            <button className={s.estop} onClick={() => m.setEmergencyStop(true)} aria-label="Emergency stop (Space)">
              <OctagonX size={18} /> EMERGENCY STOP
            </button>
          )}
        </div>
      </div>
    </Panel>
  );
}

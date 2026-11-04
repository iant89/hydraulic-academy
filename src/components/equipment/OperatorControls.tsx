import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Key, OctagonX, Power, PowerOff, RotateCcw, Anchor } from 'lucide-react';
import { useWorkbay } from '@/stores/workbay';
import { useTick } from '@/stores/simLoop';
import type { MachineFunction } from '@/simulation/machine/types';
import { Badge, Button, Meter, Panel, Range } from '@/components/ui';
import { useFmt } from './useQ';
import s from './equipment.module.css';

const opId = (f: MachineFunction, dir: number) => (f.id === 'hoist' ? (dir > 0 ? 'op:raise' : 'op:lower') : `op:${f.id}`);

/** Operator controls – every control acts on the live MachineSimulation. */
export function OperatorControls() {
  useTick();
  const m = useWorkbay((st) => st.machine);
  const session = useWorkbay((st) => st.session);
  const fmt = useFmt();
  const [latch, setLatch] = useState(false);
  const holding = useRef<{ fn: string; dir: number } | null>(null);
  const c = m.controls;
  const op = (id: string, detail: string) => session?.record('operate', id, detail);
  const fns = m.def.functions;

  const drive = (f: MachineFunction, dir: number) => {
    holding.current = dir ? { fn: f.id, dir } : null;
    m.setFunction(f.id, dir);
    if (dir) op(opId(f, dir), `${f.label} ${dir > 0 ? f.positive : f.negative}`);
  };
  const releaseAll = () => {
    if (latch || !holding.current) return;
    m.setFunction(holding.current.fn, 0);
    holding.current = null;
  };
  useEffect(() => {
    window.addEventListener('pointerup', releaseAll);
    return () => window.removeEventListener('pointerup', releaseAll);
  });
  useEffect(() => {
    const primary = fns[0];
    const key = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.repeat) return;
      if (primary && fns.length === 1 && (e.key === 'r' || e.key === 'ArrowUp')) drive(primary, 1);
      if (primary && fns.length === 1 && (e.key === 'l' || e.key === 'ArrowDown')) drive(primary, -1);
      if (e.key === ' ') {
        e.preventDefault();
        m.setEmergencyStop(true);
      }
    };
    const keyUp = (e: KeyboardEvent) => {
      if (['r', 'l', 'ArrowUp', 'ArrowDown'].includes(e.key)) releaseAll();
    };
    window.addEventListener('keydown', key);
    window.addEventListener('keyup', keyUp);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('keyup', keyUp);
    };
  });

  const rated = m.body?.cfg.ratedPayload ?? 0;
  const crane = m.craneState();
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
        {fns.map((f) => {
          const cmd = m.command(f.id);
          const blocked = m.inhibited[f.id] ?? [];
          return (
            <div key={f.id}>
              {fns.length > 1 && (
                <div className={s.small} style={{ marginBottom: 3, display: 'flex', gap: 6 }}>
                  {f.label} {blocked.length > 0 && <Badge tone="danger">cut out {blocked.map((d) => (d > 0 ? f.positive : f.negative)).join('/')}</Badge>}
                </div>
              )}
              <div className={s.hoist} style={fns.length > 1 ? { gridTemplateColumns: '1fr 0.6fr 1fr' } : undefined}>
                <button className={s.hoistBtn} style={fns.length > 1 ? { height: 36 } : undefined} data-active={cmd > 0} onPointerDown={() => drive(f, cmd > 0 && latch ? 0 : 1)} aria-label={`${f.label} ${f.positive} (hold)`}>
                  <ArrowUp size={16} /> {f.positive}
                </button>
                <button className={s.hoistBtn} style={fns.length > 1 ? { height: 36 } : undefined} data-active={cmd === 0} onPointerDown={() => drive(f, 0)} aria-label={`${f.label} neutral`}>
                  {fns.length > 1 ? 'N' : 'HOLD'}
                </button>
                <button className={s.hoistBtn} style={fns.length > 1 ? { height: 36 } : undefined} data-active={cmd < 0} onPointerDown={() => drive(f, cmd < 0 && latch ? 0 : -1)} aria-label={`${f.label} ${f.negative} (hold)`}>
                  <ArrowDown size={16} /> {f.negative}
                </button>
              </div>
            </div>
          );
        })}
        <label className={s.check}>
          <input type="checkbox" checked={latch} onChange={(e) => setLatch(e.target.checked)} /> Latch controls (otherwise press-and-hold{fns.length === 1 ? ', keys R / L' : ''})
        </label>
        {m.body && (
          <div className={s.ctlRow}>
            <span className={s.small}>Payload</span>
            {[0, 0.5, 1].map((f) => (
              <Button key={f} size="sm" active={Math.abs((m.body?.payload ?? 0) - rated * f) < 50} onClick={() => m.setPayload(rated * f)} disabled={m.bodyAngle() > 1}>
                {f === 0 ? 'Empty' : f === 0.5 ? 'Half' : 'Rated'}
              </Button>
            ))}
            <span className={s.small}>{fmt(m.body?.payload ?? 0, 'mass')}</span>
          </div>
        )}
        {crane && m.crane && (
          <div className={s.tool}>
            <div className={s.toolHead}>
              <Anchor size={14} /> Load & safety systems
            </div>
            <div className={s.small}>
              Hook load: {m.crane.hookLoad ? `${m.crane.hookLoad} kg ${crane.loadSuspended ? '(suspended)' : '(on the ground)'}` : 'none rigged'} · hook height {crane.hookHeight.toFixed(2)} m
            </div>
            <div className={s.ctlRow}>
              {[250, 500, 1000, 1500, 2000].map((kg) => (
                <Button key={kg} size="sm" active={m.crane!.hookLoad === kg} disabled={crane.hookHeight > 0.1 || crane.loadSuspended} onClick={() => m.setHookLoad(kg)} title="Rig the load – hook must be on the ground">
                  {kg} kg
                </Button>
              ))}
              <Button size="sm" disabled={crane.loadSuspended || !m.crane.hookLoad} onClick={() => m.setHookLoad(0)}>
                Unhook
              </Button>
            </div>
            <div className={s.small}>Load moment {Math.round(crane.momentFraction * 100)} % of {(crane.capacity / 1000).toFixed(1)} kN·m {crane.outriggerSet ? '' : '(stabilizer NOT set – capacity halved)'}</div>
            <Meter value={Math.min(1, crane.momentFraction)} color={crane.momentFraction > 0.9 ? 'var(--danger)' : crane.momentFraction > 0.75 ? 'var(--warn)' : 'var(--ok)'} />
            <div className={s.ctlRow}>
              <Badge tone={crane.outriggerSet ? 'ok' : 'warn'}>Stabilizer {crane.outriggerSet ? 'SET' : 'not set'}</Badge>
              <Badge tone={crane.lmiCutout ? 'danger' : 'ok'}>LMI {crane.lmiCutout ? 'CUT-OUT' : 'OK'}</Badge>
              <Badge tone={crane.a2b ? 'danger' : 'ok'}>A2B {crane.a2b ? 'ACTIVE' : 'OK'}</Badge>
            </div>
          </div>
        )}
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

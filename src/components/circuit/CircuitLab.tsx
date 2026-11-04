import { useMemo, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import type { CircuitDefinition } from '@/simulation/hydraulics/types';
import type { Quantity } from '@/simulation/core/units';
import { Schematic } from '@/visualization/schematics/Schematic';
import { Button, Panel, Range, Stat } from '@/components/ui';
import { useFmt } from '@/components/equipment/useQ';
import { useLocalSim } from './useLocalSim';

export type LabControl =
  | { kind: 'input'; label: string; component: string; key: string; min: number; max: number; step: number; quantity: Quantity; initial?: number }
  | { kind: 'param'; label: string; component: string; key: string; min: number; max: number; step: number; unit: string; initial: number }
  | { kind: 'fault'; label: string; target: string; fault: string; max?: number }
  | { kind: 'temperature'; label: string; min: number; max: number }
  | { kind: 'air'; label: string; max: number };

export type LabReadout =
  | { kind: 'pressure'; label: string; component: string; port: string }
  | { kind: 'flow'; label: string; connection: string }
  | { kind: 'readout'; label: string; component: string; key: string; quantity: Quantity }
  | { kind: 'temperature'; label: string };

export interface LabRecord {
  t: number;
  settings: Record<string, string>;
  values: Record<string, string>;
}

/**
 * Interactive circuit laboratory: schematic + controls + live readouts on a
 * stand-alone HydraulicSimulation. Parameter changes rebuild the circuit.
 */
export function CircuitLab({ circuit, controls, readouts, onRecord, height = 380 }: { circuit: CircuitDefinition; controls: LabControl[]; readouts: LabReadout[]; onRecord?(r: LabRecord): void; height?: number }) {
  const local = useLocalSim(circuit);
  const { sim, tick } = local;
  const fmt = useFmt();
  const [params, setParams] = useState<Record<string, number>>(() => Object.fromEntries(controls.filter((c) => c.kind === 'param').map((c) => [`${c.component}.${c.key}`, (c as Extract<LabControl, { kind: 'param' }>).initial])));
  const [faultSev, setFaultSev] = useState<Record<string, number>>({});
  const [, force] = useState(0);
  const def = useMemo(() => {
    const d = structuredClone(circuit);
    for (const [k, v] of Object.entries(params)) {
      const [cid, key] = k.split('.') as [string, string];
      const comp = d.components.find((c) => c.id === cid);
      if (comp) {
        if (key === 'stage1') comp.params.stages = [v];
        comp.params[key] = v;
      }
    }
    return d;
  }, [circuit, params]);

  const settingText = (): Record<string, string> => {
    const o: Record<string, string> = {};
    for (const c of controls) {
      if (c.kind === 'input') o[c.label] = fmt(sim.getInput(c.component, c.key), c.quantity);
      if (c.kind === 'param') o[c.label] = `${params[`${c.component}.${c.key}`]} ${c.unit}`;
      if (c.kind === 'fault') o[c.label] = `${Math.round((faultSev[c.fault + c.target] ?? 0) * 100)} %`;
      if (c.kind === 'temperature') o[c.label] = fmt(sim.fluidState.temperature, 'temperature');
      if (c.kind === 'air') o[c.label] = `${(sim.fluidState.airFraction * 100).toFixed(1)} %`;
    }
    return o;
  };
  const values = readouts.map((r) => {
    switch (r.kind) {
      case 'pressure':
        return { label: r.label, text: fmt(sim.pressureAt(r.component, r.port), 'pressure') };
      case 'flow':
        return { label: r.label, text: fmt(sim.flowThrough(r.connection), 'flow') };
      case 'readout':
        return { label: r.label, text: fmt(sim.readout(r.component, r.key), r.quantity) };
      case 'temperature':
        return { label: r.label, text: fmt(sim.fluidState.temperature, 'temperature') };
    }
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 12 }} className="lab">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        <div style={{ height }}>
          <Schematic circuit={sim.def} sim={sim} tick={tick} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
          {values.map((v) => (
            <Stat key={v.label} label={v.label} value={v.text} />
          ))}
          <Stat label="Sim time" value={`${sim.time.toFixed(1)} s`} />
        </div>
        {local.error && <div style={{ color: 'var(--danger)' }}>{local.error}</div>}
      </div>
      <Panel title="Controls">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Button size="sm" onClick={() => local.setRunning(!local.running)}>
              {local.running ? <Pause size={13} /> : <Play size={13} />} {local.running ? 'Pause' : 'Run'}
            </Button>
            {[1, 4].map((x) => (
              <Button key={x} size="sm" active={local.speed === x} onClick={() => local.setSpeed(x)}>
                ×{x}
              </Button>
            ))}
            <Button size="sm" onClick={() => { local.reset(def); setFaultSev({}); }}>
              <RotateCcw size={13} /> Reset
            </Button>
          </div>
          {controls.map((c) => {
            if (c.kind === 'input') {
              const v = sim.getInput(c.component, c.key);
              return <Range key={c.label} label={c.label} value={Number.isFinite(v) ? v : c.min} min={c.min} max={c.max} step={c.step} onChange={(x) => { sim.setInput(c.component, c.key, x); force((n) => n + 1); }} display={fmt(v, c.quantity)} />;
            }
            if (c.kind === 'param') {
              const k = `${c.component}.${c.key}`;
              return (
                <Range
                  key={c.label}
                  label={c.label}
                  value={params[k]!}
                  min={c.min}
                  max={c.max}
                  step={c.step}
                  onChange={(x) => {
                    const np = { ...params, [k]: x };
                    setParams(np);
                    const d = structuredClone(circuit);
                    for (const [kk, vv] of Object.entries(np)) {
                      const [cid, key] = kk.split('.') as [string, string];
                      const comp = d.components.find((cc) => cc.id === cid);
                      if (comp) {
                        if (key === 'stage1') comp.params.stages = [vv];
                        comp.params[key] = vv;
                      }
                    }
                    local.rebuild(d);
                  }}
                  display={`${params[k]} ${c.unit}`}
                />
              );
            }
            if (c.kind === 'fault') {
              const k = c.fault + c.target;
              const v = faultSev[k] ?? 0;
              return (
                <Range
                  key={c.label}
                  label={c.label}
                  value={v}
                  min={0}
                  max={c.max ?? 1}
                  step={0.01}
                  onChange={(x) => {
                    setFaultSev({ ...faultSev, [k]: x });
                    const f = sim.faults.faults.find((ff) => ff.spec.kind === c.fault && ff.spec.target === c.target);
                    if (f) f.severity = x;
                    else sim.faults.add({ id: k, kind: c.fault, target: c.target, severity: x });
                  }}
                  display={`${Math.round(v * 100)} %`}
                />
              );
            }
            if (c.kind === 'temperature') return <Range key={c.label} label={c.label} value={sim.fluidState.temperature} min={c.min} max={c.max} step={1} onChange={(x) => { sim.fluidState.temperature = x; force((n) => n + 1); }} display={fmt(sim.fluidState.temperature, 'temperature')} />;
            return <Range key={c.label} label={c.label} value={sim.fluidState.airFraction} min={0} max={c.max} step={0.002} onChange={(x) => { sim.fluidState.airFraction = x; force((n) => n + 1); }} display={`${(sim.fluidState.airFraction * 100).toFixed(1)} %`} />;
          })}
          {onRecord && (
            <Button variant="primary" onClick={() => onRecord({ t: sim.time, settings: settingText(), values: Object.fromEntries(values.map((v) => [v.label, v.text])) })}>
              Record measurement
            </Button>
          )}
        </div>
      </Panel>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { HydraulicSimulation, type SimulationOptions } from '@/simulation/hydraulics/simulation';
import type { CircuitDefinition } from '@/simulation/hydraulics/types';

/**
 * A stand-alone circuit simulation (independent of any equipment) driven in
 * real time. Used by the Playground, Circuit Builder and Fundamentals labs –
 * the same engine and component models as the equipment simulator.
 */
export function useLocalSim(initial: CircuitDefinition, opts: SimulationOptions = {}) {
  const make = () => new HydraulicSimulation(structuredClone(initial), { seed: 3, ...opts });
  const simRef = useRef<HydraulicSimulation | null>(null);
  if (!simRef.current) simRef.current = make();
  const [tick, setTick] = useState(0);
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const runRef = useRef({ running, speed });
  runRef.current = { running, speed };

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastUi = 0;
    const loop = (now: number) => {
      const dtR = Math.min(0.1, (now - last) / 1000);
      last = now;
      const sim = simRef.current;
      if (sim && runRef.current.running) {
        acc += dtR * runRef.current.speed;
        const end = performance.now() + 10;
        try {
          while (acc >= sim.dt && performance.now() < end) {
            sim.step();
            acc -= sim.dt;
          }
        } catch (e) {
          setError(String(e));
          setRunning(false);
        }
        if (acc > 1) acc = 0;
        if (now - lastUi > 90) {
          lastUi = now;
          setTick((t) => t + 1);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const reset = useCallback((def?: CircuitDefinition) => {
    simRef.current = new HydraulicSimulation(structuredClone(def ?? initial), { seed: 3, ...opts });
    setError(null);
    setTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  /** Apply a topology/parameter change while keeping compatible state. */
  const rebuild = useCallback((def: CircuitDefinition) => {
    try {
      simRef.current!.rebuild(structuredClone(def));
      setError(null);
    } catch (e) {
      setError(String(e));
    }
    setTick((t) => t + 1);
  }, []);

  return { sim: simRef.current!, tick, running, setRunning, speed, setSpeed, reset, rebuild, error };
}

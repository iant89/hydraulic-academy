import { useEffect } from 'react';
import { useWorkbay } from './workbay';

/**
 * Drives the shared workbay machine in real time (× time scale) using a
 * fixed simulation step. UI subscribers are notified at ~12 Hz; the 3D
 * view reads the simulation every animation frame directly.
 */
let started = false;
let acc = 0;
let lastNotify = 0;

export function useSimulationLoop() {
  useEffect(() => {
    if (started) return;
    started = true;
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const st = useWorkbay.getState();
      const dtReal = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (st.running) {
        acc += dtReal * st.timeScale;
        const m = st.machine;
        const dt = m.sim.dt;
        let steps = 0;
        const budget = performance.now() + 12;
        while (acc >= dt && performance.now() < budget) {
          m.step();
          acc -= dt;
          steps++;
        }
        if (acc > 1) acc = 0; // drop backlog rather than spiral
        if (steps && now - lastNotify > 80) {
          lastNotify = now;
          st.bump();
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      started = false;
    };
  }, []);
}

/** Re-render on simulation ticks. */
export function useTick() {
  return useWorkbay((s) => s.tick);
}

import { create } from 'zustand';
import type { WorkshopJob } from '@/workshop/procedures';
import type { MachineSimulation } from '@/simulation/machine/machine';

/** Active workshop job (survives navigation between pages). */
interface JobsState {
  job: WorkshopJob | null;
  machine: MachineSimulation | null;
  history: { title: string; t: number; steps: number }[];
  setJob(job: WorkshopJob | null): void;
}

export const useJobs = create<JobsState>((set, get) => ({
  job: null,
  machine: null,
  history: [],
  setJob(job) {
    const prev = get().job;
    const history = prev && prev.done.size ? [{ title: prev.procedure.title, t: prev.m.time, steps: prev.done.size }, ...get().history] : get().history;
    set({ job, machine: job?.m ?? null, history });
  },
}));

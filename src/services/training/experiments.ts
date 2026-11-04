import { db } from '@/services/persistence/db';
import type { CircuitDefinition } from '@/simulation/hydraulics/types';
import type { LabRecord } from '@/components/circuit/CircuitLab';

export interface PlaygroundExperiment {
  id: string;
  name: string;
  experimentId: string | null;
  date: string;
  circuit: CircuitDefinition;
  measurements: LabRecord[];
  observations: string;
  conclusions: string;
}

export const experimentsRepo = {
  async list(): Promise<PlaygroundExperiment[]> {
    return (await db.list<PlaygroundExperiment>('experiments')).sort((a, b) => b.date.localeCompare(a.date));
  },
  save: (e: PlaygroundExperiment) => db.put('experiments', e.id, e),
  remove: (id: string) => db.delete('experiments', id),
};

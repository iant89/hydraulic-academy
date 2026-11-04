import type { DiagnosticScenario, ScenarioBrief } from '@/simulation/scenarios/types';
import { DUMP_TRUCK_BRIEFS } from './dump-truck.briefs';

export const SCENARIO_BRIEFS: ScenarioBrief[] = [...DUMP_TRUCK_BRIEFS];

export function briefById(id: string): ScenarioBrief | undefined {
  return SCENARIO_BRIEFS.find((b) => b.id === id);
}

/** Loads the hidden key on demand (separate chunk – not bundled with the briefs). */
export async function loadScenario(id: string): Promise<DiagnosticScenario> {
  const brief = briefById(id);
  if (!brief) throw new Error(`Unknown scenario ${id}`);
  const { DUMP_TRUCK_KEYS } = await import('./dump-truck.keys');
  const key = DUMP_TRUCK_KEYS.find((k) => k.scenarioId === id);
  if (!key) throw new Error(`Scenario ${id} has no key`);
  return { brief, key };
}

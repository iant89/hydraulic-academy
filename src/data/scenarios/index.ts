import type { DiagnosticScenario, ScenarioBrief } from '@/simulation/scenarios/types';
import { DUMP_TRUCK_BRIEFS } from './dump-truck.briefs';
import { SERVICE_CRANE_BRIEFS } from './service-crane.briefs';

export const SCENARIO_BRIEFS: ScenarioBrief[] = [...DUMP_TRUCK_BRIEFS, ...SERVICE_CRANE_BRIEFS];

/** Equipment definition id → built-in profile the scenarios are authored for. */
export const SCENARIO_PROFILE: Record<string, string> = { 'generic-dump-truck': 'generic-dt-15', 'generic-service-crane': 'generic-svc-crane' };

export function briefById(id: string): ScenarioBrief | undefined {
  return SCENARIO_BRIEFS.find((b) => b.id === id);
}

/** Loads the hidden key on demand (separate chunks – not bundled with the briefs). */
export async function loadScenario(id: string): Promise<DiagnosticScenario> {
  const brief = briefById(id);
  if (!brief) throw new Error(`Unknown scenario ${id}`);
  const keys = id.startsWith('sc-') ? (await import('./service-crane.keys')).SERVICE_CRANE_KEYS : (await import('./dump-truck.keys')).DUMP_TRUCK_KEYS;
  const key = keys.find((k) => k.scenarioId === id);
  if (!key) throw new Error(`Scenario ${id} has no key`);
  return { brief, key };
}

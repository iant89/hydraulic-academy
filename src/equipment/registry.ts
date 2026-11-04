import type { MachineDefinition } from '@/simulation/machine/types';
import type { EquipmentProfile, InspectionPoint } from './shared/types';
import { dumpTruckDefinition } from './dump-truck/definition';
import { DUMP_TRUCK_INSPECTION } from './dump-truck/inspection';

export interface EquipmentTemplate {
  id: string;
  name: string;
  build: () => MachineDefinition;
  inspection: InspectionPoint[];
}

export const TEMPLATES: Record<string, EquipmentTemplate> = {
  'dump-truck': { id: 'dump-truck', name: 'Hydraulic dump truck', build: dumpTruckDefinition, inspection: DUMP_TRUCK_INSPECTION },
};

/**
 * Build a machine from an equipment profile: the template supplies the
 * reusable component layout; the profile supplies the configuration.
 * No simulation logic is equipment-specific.
 */
export function machineFromProfile(profile: EquipmentProfile): MachineDefinition {
  const tpl = TEMPLATES[profile.template];
  if (!tpl) throw new Error(`Unknown equipment template ${profile.template}`);
  const def = tpl.build();
  def.id = profile.id;
  def.name = `${profile.manufacturer} ${profile.name}`;
  for (const [compId, params] of Object.entries(profile.overrides)) {
    const c = def.circuit.components.find((x) => x.id === compId);
    if (c) Object.assign(c.params, params);
  }
  if (profile.machineOverrides?.ratedPayload) for (const m of def.mechanisms) m.ratedPayload = profile.machineOverrides.ratedPayload;
  if (profile.machineOverrides?.ptoRatio) def.pto.ratio = profile.machineOverrides.ptoRatio;
  return def;
}

export function inspectionFor(profile: EquipmentProfile): InspectionPoint[] {
  return TEMPLATES[profile.template]?.inspection ?? [];
}

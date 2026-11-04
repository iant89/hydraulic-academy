import type { MachineDefinition } from '@/simulation/machine/types';
import type { EquipmentProfile, InspectionPoint } from './shared/types';
import { dumpTruckDefinition } from './dump-truck/definition';
import { DUMP_TRUCK_INSPECTION } from './dump-truck/inspection';
import { serviceCraneDefinition } from './service-crane/definition';
import { SERVICE_CRANE_INSPECTION } from './service-crane/inspection';

export interface Assembly {
  id: string;
  label: string;
  components: string[];
  connections: string[];
}

export interface EquipmentTemplate {
  id: string;
  name: string;
  build: () => MachineDefinition;
  inspection: InspectionPoint[];
  /** Sub-assemblies for component isolation in the workshop. */
  assemblies: Assembly[];
}

export const TEMPLATES: Record<string, EquipmentTemplate> = {
  'dump-truck': {
    id: 'dump-truck',
    name: 'Hydraulic dump truck',
    build: dumpTruckDefinition,
    inspection: DUMP_TRUCK_INSPECTION,
    assemblies: [
      { id: 'pto-pump', label: 'PTO & pump assembly', components: ['pump'], connections: ['suction', 'pressure'] },
      { id: 'valve', label: 'Valve assembly', components: ['dcv', 'relief'], connections: ['pressure', 'relief-supply', 'relief-return', 'return', 'work'] },
      { id: 'reservoir', label: 'Reservoir & filtration', components: ['tank', 'filter', 'cooler'], connections: ['suction', 'return', 'relief-return', 'filter-out', 'cooler-out'] },
      { id: 'cylinder', label: 'Hoist cylinder assembly', components: ['cyl'], connections: ['work'] },
      { id: 'hoses', label: 'Hydraulic hose network', components: [], connections: [] },
    ],
  },
  'service-crane': {
    id: 'service-crane',
    name: 'Service truck crane',
    build: serviceCraneDefinition,
    inspection: SERVICE_CRANE_INSPECTION,
    assemblies: [
      { id: 'pto-pump', label: 'PTO & pump assembly', components: ['pump', 'relief'], connections: ['suction', 'pressure', 'relief-supply'] },
      { id: 'valvebank', label: 'Valve bank', components: ['dcv-out', 'dcv-slew', 'dcv-lift', 'dcv-ext', 'dcv-winch'], connections: [] },
      { id: 'lift', label: 'Boom lift & counterbalance', components: ['dcv-lift', 'cb-lift', 'cyl-lift'], connections: [] },
      { id: 'winch', label: 'Winch circuit', components: ['dcv-winch', 'cb-winch', 'mot-winch'], connections: [] },
      { id: 'stabilizer', label: 'Stabilizer circuit', components: ['dcv-out', 'pc-out', 'cyl-out'], connections: [] },
      { id: 'hoses', label: 'Hydraulic hose network', components: [], connections: [] },
    ],
  },
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
  if (profile.machineOverrides?.ratedPayload) for (const m of def.mechanisms) if (m.type === 'dump-body') m.ratedPayload = profile.machineOverrides.ratedPayload;
  if (profile.machineOverrides?.ptoRatio) def.pto.ratio = profile.machineOverrides.ptoRatio;
  return def;
}

export function inspectionFor(profile: EquipmentProfile): InspectionPoint[] {
  return TEMPLATES[profile.template]?.inspection ?? [];
}

export function assembliesFor(profile: EquipmentProfile): Assembly[] {
  return TEMPLATES[profile.template]?.assemblies ?? [];
}

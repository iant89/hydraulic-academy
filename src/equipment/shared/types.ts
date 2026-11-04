import type { Params } from '@/simulation/hydraulics/types';
import type { InspectionTargets } from '@/simulation/scenarios/observations';

/**
 * Provenance of every specification value. A value is only ever shown as a
 * manufacturer specification when it is linked to a manufacturer document.
 */
export type VerificationStatus = 'manufacturer-verified' | 'technician-provided' | 'simulated-training';

export interface ManufacturerDocument {
  id: string;
  title: string;
  manufacturer: string;
  kind: 'hydraulic-schematic' | 'service-manual' | 'operator-manual' | 'component-manual' | 'maintenance-schedule' | 'parts-catalog' | 'troubleshooting' | 'specification-sheet';
  equipmentApplicability: string;
  modelApplicability: string;
  revision: string;
  publicationDate: string;
  section: string;
  reference: string;
  status: VerificationStatus;
  /** Uploaded file (IndexedDB blob key) */
  fileKey?: string;
  notes?: string;
}

export interface SpecValue {
  value: number | string;
  unit?: string;
  status: VerificationStatus;
  /** Required when status is manufacturer-verified. */
  documentId?: string;
  page?: string;
  note?: string;
}

export interface SlotRequirement {
  componentType: string;
  displacement?: number;
  rotation?: 'cw' | 'ccw';
  shaft?: string;
  mount?: string;
  ports?: Record<string, string>;
  minPressureRating?: number;
  minFlow?: number;
  maxFlow?: number;
  voltage?: number;
  bore?: number;
  stages?: number[];
  stroke?: number;
  mountType?: string;
  variant?: string;
  fluids?: string[];
  micron?: number;
}

export interface InspectionPoint {
  id: string;
  zone: 'engine' | 'hydraulic' | 'body' | 'controls';
  label: string;
  description: string;
  targets: InspectionTargets;
  /** What a technician should check here. */
  checklist: string[];
  /** Position in the equipment model frame (m). */
  position: [number, number, number];
  safety?: string;
}

export interface EquipmentProfile {
  id: string;
  manufacturer: string;
  name: string;
  model: string;
  modelYear: string;
  category: 'dump-truck' | 'service-truck' | 'roll-off' | 'crane' | 'excavator' | 'loader' | 'skid-steer' | 'power-unit' | 'winch' | 'lift';
  serialApplicability: string;
  engine: string;
  environment: string;
  template: string;
  generic: boolean;
  description: string;
  /** Parameter overrides applied to the template circuit (component id → params). */
  overrides: Record<string, Params>;
  machineOverrides?: { ratedPayload?: number; ptoRatio?: number };
  specs: Record<string, SpecValue>;
  slots: Record<string, SlotRequirement>;
  documents: ManufacturerDocument[];
  createdBy?: 'system' | 'user';
  updatedAt?: string;
}

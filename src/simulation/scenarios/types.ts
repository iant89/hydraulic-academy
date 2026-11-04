import type { FaultSpec } from '../failures/faults';
import type { ConnectionDefinition } from '../hydraulics/types';

export type TrainingMode = 'guided' | 'practical' | 'challenge' | 'master';

export type VerificationCriterion =
  | { type: 'pto-drive'; label: string }
  | { type: 'raise-loaded'; label: string; maxSeconds: number }
  | { type: 'relief-pressure'; label: string; min: number; max: number }
  | { type: 'no-leaks'; label: string; seconds: number }
  | { type: 'hold-drift'; label: string; maxMmPerMin: number }
  | { type: 'lowers'; label: string }
  | { type: 'no-cavitation'; label: string };

/** Technician-visible scenario data. Contains NO fault information. */
export interface ScenarioBrief {
  id: string;
  title: string;
  equipmentId: string;
  mode: TrainingMode;
  difficulty: 1 | 2 | 3 | 4 | 5;
  customer: string;
  complaint: string;
  history: string[];
  conditions: {
    payload: number;
    ambient: number;
    initialTemperature: number;
    hoursSinceService?: number;
  };
  verification: VerificationCriterion[];
  learningObjectives: string[];
  hints?: string[];
}

/** Hidden scenario key – loaded only by the diagnostic engine. */
export interface ScenarioKey {
  scenarioId: string;
  faults: FaultSpec[];
  /** State modifications applied at scenario start. */
  setup?: {
    reservoirVolumeL?: number;
    fluid?: { contamination?: number; water?: number; grade?: string; airFraction?: number };
    reconnect?: { connection: string; from?: ConnectionDefinition['from']; to?: ConnectionDefinition['to'] }[];
    replaceParams?: { component: string; params: Record<string, number | string | boolean> }[];
  };
  /** Groups of tests; performing any test from a group satisfies it. */
  evidence: { label: string; anyOf: string[] }[];
  explanation: string;
}

export interface DiagnosticScenario {
  brief: ScenarioBrief;
  key: ScenarioKey;
}

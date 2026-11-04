import type {
  ComponentInstanceDefinition,
  FlowElement,
  NodeInfo,
  ParamValue,
  PortDefinition,
  RuntimeComponent,
  StepEnv,
} from '../hydraulics/types';
import type { Quantity } from '../core/units';

export interface BuildCtx {
  envRef: { current: StepEnv };
  /** Node for a component port. Volume (m^3) adds to the node's capacitance. */
  port(def: ComponentInstanceDefinition, portId: string, volume?: number): number;
  internal(owner: string, label: string, volume: number): number;
  boundary(owner: string, label: string, fn: () => number, kind?: 'tank' | 'atmosphere'): number;
  atmosphere(): number;
  nodeInfo(index: number): NodeInfo;
}

export interface ParamSpec {
  key: string;
  label: string;
  quantity: Quantity;
  min?: number;
  max?: number;
  default: ParamValue;
  step?: number;
  options?: { value: string; label: string }[];
  /** Adjustable while the circuit is running (operator/technician input). */
  live?: boolean;
  description?: string;
}

export type ComponentCategory = 'pump' | 'valve' | 'actuator' | 'conditioning' | 'storage' | 'instrument';

export interface ComponentModel {
  type: string;
  name: string;
  category: ComponentCategory;
  symbol: string;
  summary: string;
  ports(def: ComponentInstanceDefinition): PortDefinition[];
  params: ParamSpec[];
  /** Live inputs (operator controls) and their default values. */
  inputs: { key: string; label: string; min: number; max: number; default: number; quantity: Quantity; step?: number }[];
  faultKinds: string[];
  build(ctx: BuildCtx, def: ComponentInstanceDefinition): RuntimeComponent;
}

export function num(def: ComponentInstanceDefinition, key: string, fallback: number): number {
  const v = def.params[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
export function str(def: ComponentInstanceDefinition, key: string, fallback: string): string {
  const v = def.params[key];
  return typeof v === 'string' ? v : fallback;
}
export function bool(def: ComponentInstanceDefinition, key: string, fallback: boolean): boolean {
  const v = def.params[key];
  return typeof v === 'boolean' ? v : fallback;
}
export function arr(def: ComponentInstanceDefinition, key: string, fallback: number[]): number[] {
  const v = def.params[key];
  return Array.isArray(v) && v.length > 0 ? v : fallback;
}

export function element(
  id: string,
  owner: string,
  label: string,
  nodes: number[],
  fn: (p: Float64Array, out: Float64Array) => void,
  dissipative = true,
  external = false,
): FlowElement {
  return { id, owner, label, nodes, flow: fn, dissipative, external };
}

/** Two-terminal element defined by Q(a→b) = f(pa, pb). */
export function branch(
  id: string,
  owner: string,
  label: string,
  a: number,
  b: number,
  q: (pa: number, pb: number) => number,
  dissipative = true,
  external = false,
): FlowElement {
  return element(
    id,
    owner,
    label,
    [a, b],
    (p, out) => {
      const f = q(p[a]!, p[b]!);
      out[0] = -f;
      out[1] = f;
    },
    dissipative,
    external,
  );
}

export const smoothstep = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export function baseRuntime(def: ComponentInstanceDefinition): RuntimeComponent {
  return {
    id: def.id,
    type: def.type,
    label: def.label,
    def,
    elements: [],
    portNodes: {},
    inputs: {},
    getState: () => ({}),
    setState: () => {},
    readouts: () => [],
  };
}

export function port(id: string, marking: string, label: string, role: PortDefinition['role'], description: string): PortDefinition {
  return { id, marking, label, role, description };
}

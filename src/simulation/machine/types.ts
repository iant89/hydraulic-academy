import type { CircuitDefinition } from '../hydraulics/types';

export interface EngineConfig {
  idleRpm: number;
  maxRpm: number;
  /** Maximum engine speed at which the PTO may be engaged. */
  ptoEngageMaxRpm: number;
  /** Peak torque available at the crank for accessory drive (N·m). */
  availableTorque: number;
}

export interface PTOConfig {
  id: string;
  label: string;
  /** Output speed / engine speed */
  ratio: number;
  /** Output rotation as viewed facing the PTO output shaft. */
  outputRotation: 'cw' | 'ccw';
  /** Intermittent output torque rating (N·m) – training value unless sourced. */
  ratedTorque: number;
  shiftTime: number;
  /** Requires parking brake set to engage (interlock). */
  requiresParkingBrake: boolean;
}

export type ElectricalDevice = 'pto-solenoid' | 'dcv-solenoid-a' | 'dcv-solenoid-b';

export interface ElectricalCircuitConfig {
  id: string;
  label: string;
  device: ElectricalDevice;
  /** Hydraulic component the device acts on (for dcv solenoids). */
  target?: string;
  coilResistance: number;
  wireResistance: number;
  pullInVoltage: number;
  fuse: string;
  connector: string;
}

export interface DumpBodyMechanismConfig {
  type: 'dump-body';
  id: string;
  label: string;
  cylinder: string;
  bodyMass: number;
  ratedPayload: number;
  /** Body-frame (x forward from hinge, y up) cylinder attach point (m). */
  attach: [number, number];
  /** Chassis-frame cylinder base pivot (m). */
  base: [number, number];
  /** Body-frame centre of gravity of body + payload (m). */
  cg: [number, number];
  /** Angle (deg) at which load begins to slide out. */
  dischargeAngle: number;
  maxAngle: number;
  length: number;
}

export type MechanismConfig = DumpBodyMechanismConfig;

export interface TestPointConfig {
  id: string;
  label: string;
  component: string;
  port: string;
  /** Typical installed coupling. */
  coupling: string;
  location: string;
}

export interface MachineDefinition {
  id: string;
  name: string;
  circuit: CircuitDefinition;
  engine: EngineConfig;
  pto: PTOConfig;
  /** Pump driven by the PTO. */
  pump: string;
  electrical: ElectricalCircuitConfig[];
  mechanisms: MechanismConfig[];
  testPoints: TestPointConfig[];
  /** Directional valve operated by the hoist control. */
  hoistValve: string;
  /** Relief valve protecting the hoist circuit. */
  mainRelief: string;
  /** Pressure connection used to install an in-line flow tester. */
  flowTestConnection: string;
}

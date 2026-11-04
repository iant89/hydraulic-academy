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
  /** Operator function that energises this solenoid (dcv solenoids). */
  function?: string;
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

/**
 * Telescopic knuckle-less service crane. Boom plane geometry is relative to
 * the boom pivot P (x outward along the boom at 0°, y up). The crane base
 * sits on the truck; slew rotates the whole boom plane about a vertical axis.
 */
export interface CraneMechanismConfig {
  type: 'crane';
  id: string;
  label: string;
  liftCylinder: string;
  extendCylinder: string;
  winchMotor: string;
  slewMotor: string;
  outriggerCylinder: string;
  /** Lift cylinder base relative to the boom pivot (m). */
  liftBase: [number, number];
  /** Lift cylinder attach point on the boom, boom frame (m). */
  liftAttach: [number, number];
  /** Boom pivot height above ground (m). */
  pivotHeight: number;
  minAngle: number;
  maxAngle: number;
  /** Retracted boom length, pivot to sheave (m). */
  boomLength: number;
  boomMass: number;
  /** Mass of the extending section (m). */
  extensionMass: number;
  winchGearRatio: number;
  drumRadius: number;
  /** Cable paid out when the hook is at ground level with the boom stowed (m). */
  maxCable: number;
  slewGearRatio: number;
  slewFrictionTorque: number;
  /** Rated load moment with stabilizer set (N·m). */
  ratedMoment: number;
  /** Maximum winch line load (kg). */
  maxLoad: number;
  /** Anti-two-block switch distance (m). */
  a2bDistance: number;
  outriggerContact: number;
  outriggerStiffness: number;
  /** Share of truck weight carried by the stabilizer leg when set (N). */
  outriggerShare: number;
}

export type MechanismConfig = DumpBodyMechanismConfig | CraneMechanismConfig;

/** An operator function: a control that commands one directional valve. */
export interface MachineFunction {
  id: string;
  label: string;
  valve: string;
  actuation: 'solenoid' | 'lever';
  positive: string;
  negative: string;
  /** Actuator moved by this function, and the readout that indicates movement. */
  actuator: string;
  movementKey: 'velocity' | 'speed';
}

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
  /** Operator functions (first is the primary function). */
  functions: MachineFunction[];
  /** Relief valve protecting the hoist circuit. */
  mainRelief: string;
  /** Pressure connection used to install an in-line flow tester. */
  flowTestConnection: string;
}

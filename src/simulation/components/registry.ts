import type { ComponentModel } from './base';
import { gearPumpModel, vanePumpModel, pistonPumpModel, manualPumpModel } from './pumps';
import {
  reliefValveModel,
  dcvModel,
  checkValveModel,
  pilotCheckModel,
  counterbalanceModel,
  pressureReducingModel,
  flowControlModel,
  unloadingValveModel,
  priorityValveModel,
} from './valves';
import { cylinderModel, motorModel } from './actuators';
import {
  reservoirModel,
  filterModel,
  coolerModel,
  accumulatorModel,
  orificeModel,
  gaugeModel,
  flowMeterModel,
  tempSensorModel,
  openPortModel,
} from './support';

export const COMPONENT_MODELS: ComponentModel[] = [
  gearPumpModel,
  vanePumpModel,
  pistonPumpModel,
  manualPumpModel,
  reliefValveModel,
  dcvModel,
  checkValveModel,
  pilotCheckModel,
  counterbalanceModel,
  pressureReducingModel,
  flowControlModel,
  unloadingValveModel,
  priorityValveModel,
  cylinderModel,
  motorModel,
  reservoirModel,
  filterModel,
  coolerModel,
  accumulatorModel,
  orificeModel,
  gaugeModel,
  flowMeterModel,
  tempSensorModel,
  openPortModel,
];

const BY_TYPE = new Map(COMPONENT_MODELS.map((m) => [m.type, m]));

export function getModel(type: string): ComponentModel {
  const m = BY_TYPE.get(type);
  if (!m) throw new Error(`Unknown component type "${type}"`);
  return m;
}

export function hasModel(type: string): boolean {
  return BY_TYPE.has(type);
}

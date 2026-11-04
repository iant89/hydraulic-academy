/**
 * Fundamental hydraulic relationships (SI units). These are the textbook
 * equations used throughout the lessons and by the component models.
 */
import { circleArea } from '../core/units';

/** P = F / A  (Pa) */
export const pressureFromForce = (force: number, area: number) => force / area;
/** F = P × A  (N) */
export const forceFromPressure = (pressure: number, area: number) => pressure * area;
/** Q = Vd × n × ηv  (m^3/s). displacement m^3/rev, speed rpm. */
export const pumpFlow = (displacement: number, rpm: number, volumetricEfficiency = 1) =>
  displacement * (rpm / 60) * volumetricEfficiency;
/** v = Q / A (m/s) */
export const cylinderVelocity = (flow: number, area: number) => flow / area;
/** Ph = p × Q (W) */
export const hydraulicPower = (pressure: number, flow: number) => pressure * flow;
/** Shaft torque required to drive a pump: T = Vd·Δp / (2π·ηm) (N·m) */
export const pumpTorque = (displacement: number, dp: number, mechEfficiency = 1) =>
  (displacement * dp) / (2 * Math.PI * mechEfficiency);
/** Annulus (rod-side) area of a cylinder. */
export const annulusArea = (bore: number, rod: number) => circleArea(bore) - circleArea(rod);
/** Ideal force multiplication between two pistons (Pascal). */
export const pascalOutputForce = (inputForce: number, inputArea: number, outputArea: number) =>
  (inputForce / inputArea) * outputArea;

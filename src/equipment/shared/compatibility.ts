import { BAR } from '@/simulation/core/units';
import type { PartDefinition, HosePart } from '@/data/parts/catalog';
import type { SlotRequirement } from './types';

export interface CompatibilityIssue {
  field: string;
  severity: 'blocking' | 'warning';
  message: string;
  consequence: string;
}

/**
 * Validate a replacement part against the equipment slot requirement.
 * Blocking = cannot physically be installed. Warning = fits but is wrong
 * for the application (and the simulation will show the consequence).
 * Components are never assumed interchangeable because they share a type.
 */
export function checkCompatibility(part: PartDefinition, slot: SlotRequirement): CompatibilityIssue[] {
  const s = part.specs;
  const issues: CompatibilityIssue[] = [];
  if (part.componentType !== slot.componentType) {
    issues.push({ field: 'type', severity: 'blocking', message: `Part is a ${part.componentType}, slot requires a ${slot.componentType}.`, consequence: 'Different component type – not a replacement.' });
    return issues;
  }
  if (slot.mount && s.mount && slot.mount !== s.mount) issues.push({ field: 'mount', severity: 'blocking', message: `Mounting flange ${s.mount} does not match ${slot.mount}.`, consequence: 'Pump cannot be bolted to the PTO.' });
  if (slot.shaft && s.shaft && slot.shaft !== s.shaft) issues.push({ field: 'shaft', severity: 'blocking', message: `Shaft ${s.shaft} does not match ${slot.shaft}.`, consequence: 'Shaft will not engage the PTO output coupling.' });
  if (slot.mountType && s.mountType && slot.mountType !== s.mountType) issues.push({ field: 'mountType', severity: 'blocking', message: `Mounting ${s.mountType} does not match ${slot.mountType}.`, consequence: 'Cylinder cannot be pinned to the existing mounts.' });
  if (slot.stroke !== undefined && s.stroke !== undefined && Math.abs(slot.stroke - s.stroke) > 0.01) issues.push({ field: 'stroke', severity: 'blocking', message: `Stroke ${s.stroke} m differs from ${slot.stroke} m.`, consequence: 'Closed/extended length does not fit the body geometry.' });
  if (slot.variant && s.variant && slot.variant !== s.variant) issues.push({ field: 'variant', severity: 'blocking', message: `Valve configuration ${s.variant} does not match ${slot.variant}.`, consequence: 'Port count/spool function differ – the circuit cannot be connected as designed.' });
  if (slot.ports && s.ports) {
    for (const [p, spec] of Object.entries(slot.ports)) {
      if (s.ports[p] && s.ports[p] !== spec) issues.push({ field: `port-${p}`, severity: 'blocking', message: `Port ${p} is ${s.ports[p]}; hose end is ${spec}.`, consequence: 'Existing hose fittings will not seal. Never force mismatched threads.' });
      if (!s.ports[p]) issues.push({ field: `port-${p}`, severity: 'blocking', message: `Part has no port ${p}.`, consequence: 'Cannot connect the circuit.' });
    }
  }
  if (slot.rotation && s.rotation && slot.rotation !== s.rotation) issues.push({ field: 'rotation', severity: 'warning', message: `Rotation ${s.rotation.toUpperCase()} – equipment requires ${slot.rotation.toUpperCase()}.`, consequence: 'Pump will try to pump backwards: no flow to the system, suction side pressurised, shaft seal failure.' });
  if (slot.displacement !== undefined && s.displacement !== undefined && Math.abs(slot.displacement - s.displacement) / slot.displacement > 0.05)
    issues.push({ field: 'displacement', severity: 'warning', message: `Displacement ${s.displacement} cm³/rev vs required ${slot.displacement} cm³/rev.`, consequence: s.displacement > slot.displacement ? 'Higher flow and torque – may overload the PTO and exceed valve/hose velocity limits.' : 'Slower operation.' });
  if (slot.minPressureRating !== undefined && s.maxPressure !== undefined && s.maxPressure < slot.minPressureRating)
    issues.push({ field: 'pressure', severity: 'warning', message: `Pressure rating ${(s.maxPressure / BAR).toFixed(0)} bar below required ${(slot.minPressureRating / BAR).toFixed(0)} bar.`, consequence: 'Component may fail in service.' });
  if (slot.minFlow !== undefined && s.ratedFlow !== undefined && s.ratedFlow < slot.minFlow) issues.push({ field: 'flow', severity: 'warning', message: `Rated flow ${s.ratedFlow} L/min below system flow ${slot.minFlow} L/min.`, consequence: 'Excess pressure drop and heat; relief may not pass full pump flow.' });
  if (slot.voltage !== undefined && s.voltage !== undefined && slot.voltage !== s.voltage) issues.push({ field: 'voltage', severity: 'warning', message: `${s.voltage} V coils on a ${slot.voltage} V system.`, consequence: s.voltage > slot.voltage ? 'Coils will not pull in reliably – function inoperative.' : 'Coils overheat and burn out.' });
  if (slot.stages && s.stages && slot.stages.join(',') !== s.stages.join(',')) issues.push({ field: 'stages', severity: 'warning', message: `Stage bores ${s.stages.join('/')} mm vs ${slot.stages.join('/')} mm.`, consequence: 'Different effective areas: higher pressure for the same load – may not lift rated payload.' });
  if (slot.micron !== undefined && s.micron !== undefined && s.micron > slot.micron) issues.push({ field: 'micron', severity: 'warning', message: `${s.micron} µm element vs specified ${slot.micron} µm.`, consequence: 'Lower filtration efficiency – accelerated component wear.' });
  return issues;
}

export function checkHose(hose: HosePart, lineType: string, requiredDiameterMm: number, systemMaxPressureBar: number): CompatibilityIssue[] {
  const issues: CompatibilityIssue[] = [];
  if (Math.abs(hose.innerDiameterMm - requiredDiameterMm) > 0.5) issues.push({ field: 'diameter', severity: 'blocking', message: `Hose ID ${hose.innerDiameterMm} mm vs ${requiredDiameterMm} mm.`, consequence: 'Fittings do not match the ports.' });
  if (lineType === 'suction' && hose.construction !== 'suction-hose') issues.push({ field: 'construction', severity: 'warning', message: 'Not a wire-helix suction hose.', consequence: 'Hose can collapse under inlet vacuum and starve the pump.' });
  if (lineType !== 'suction' && hose.workingPressureBar < systemMaxPressureBar) issues.push({ field: 'rating', severity: 'warning', message: `Working pressure ${hose.workingPressureBar} bar below system maximum ${systemMaxPressureBar} bar.`, consequence: 'Hose is under-rated – burst risk.' });
  return issues;
}

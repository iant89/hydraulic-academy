import type { Params } from '@/simulation/hydraulics/types';
import type { SlotRequirement, VerificationStatus } from '@/equipment/shared/types';

/**
 * Replacement parts available in the virtual parts store. All parts are
 * GENERIC TRAINING PARTS – their numbers and specifications are simulated.
 */
export interface PartDefinition {
  id: string;
  name: string;
  componentType: string;
  partNumber: string;
  manufacturer: string;
  status: VerificationStatus;
  specs: SlotRequirement & { maxPressure?: number; ratedFlow?: number; seal?: string };
  /** Simulation parameters for a component instance built from this part. */
  params: Params;
  notes?: string;
}

const TRAINING = 'Generic training part';
const pumpParams = (displacement: number, rotation: 'cw' | 'ccw', volEff = 0.93): Params => ({
  displacement,
  ratedSpeed: 2400,
  rotation,
  volumetricEfficiency: volEff,
  mechanicalEfficiency: 0.88,
  testPressure: 170,
  maxPressure: 207,
  speed: 0,
});

export const PARTS: PartDefinition[] = [
  // Pumps
  { id: 'gp-70-ccw-sae-b', name: 'Gear pump 70 cm³/rev, CCW, SAE B 2-bolt, 13T spline', componentType: 'pump-gear', partNumber: 'TR-GP70-L-B13', manufacturer: TRAINING, status: 'simulated-training', specs: { componentType: 'pump-gear', displacement: 70, rotation: 'ccw', shaft: 'SAE B 13T spline', mount: 'SAE B 2-bolt', ports: { IN: '-24 SAE split flange', OUT: '-16 SAE ORB' }, maxPressure: 207e5, fluids: ['mineral'] }, params: pumpParams(70, 'ccw') },
  { id: 'gp-70-cw-sae-b', name: 'Gear pump 70 cm³/rev, CW, SAE B 2-bolt, 13T spline', componentType: 'pump-gear', partNumber: 'TR-GP70-R-B13', manufacturer: TRAINING, status: 'simulated-training', specs: { componentType: 'pump-gear', displacement: 70, rotation: 'cw', shaft: 'SAE B 13T spline', mount: 'SAE B 2-bolt', ports: { IN: '-24 SAE split flange', OUT: '-16 SAE ORB' }, maxPressure: 207e5, fluids: ['mineral'] }, params: pumpParams(70, 'cw'), notes: 'Identical in appearance to the CCW unit except for the rotation arrow and port sizes swapped side.' },
  { id: 'gp-90-ccw-sae-b', name: 'Gear pump 90 cm³/rev, CCW, SAE B 2-bolt, 13T spline', componentType: 'pump-gear', partNumber: 'TR-GP90-L-B13', manufacturer: TRAINING, status: 'simulated-training', specs: { componentType: 'pump-gear', displacement: 90, rotation: 'ccw', shaft: 'SAE B 13T spline', mount: 'SAE B 2-bolt', ports: { IN: '-24 SAE split flange', OUT: '-16 SAE ORB' }, maxPressure: 207e5, fluids: ['mineral'] }, params: pumpParams(90, 'ccw') },
  { id: 'gp-70-ccw-sae-a', name: 'Gear pump 70 cm³/rev, CCW, SAE A 2-bolt, 9T spline', componentType: 'pump-gear', partNumber: 'TR-GP70-L-A9', manufacturer: TRAINING, status: 'simulated-training', specs: { componentType: 'pump-gear', displacement: 70, rotation: 'ccw', shaft: 'SAE A 9T spline', mount: 'SAE A 2-bolt', ports: { IN: '-24 SAE split flange', OUT: '-16 SAE ORB' }, maxPressure: 207e5, fluids: ['mineral'] }, params: pumpParams(70, 'ccw') },
  { id: 'gp-70-ccw-sae-b-reman', name: 'Gear pump 70 cm³/rev, CCW, SAE B (remanufactured)', componentType: 'pump-gear', partNumber: 'TR-GP70-L-B13-R', manufacturer: TRAINING, status: 'simulated-training', specs: { componentType: 'pump-gear', displacement: 70, rotation: 'ccw', shaft: 'SAE B 13T spline', mount: 'SAE B 2-bolt', ports: { IN: '-24 SAE split flange', OUT: '-16 SAE ORB' }, maxPressure: 207e5, fluids: ['mineral'] }, params: pumpParams(70, 'ccw', 0.92) },
  // Relief valves
  { id: 'rv-150', name: 'Direct-acting relief valve, 150 L/min, 70–210 bar range', componentType: 'relief-valve', partNumber: 'TR-RV150', manufacturer: TRAINING, status: 'simulated-training', specs: { componentType: 'relief-valve', ports: { P: '-16 ORB', T: '-16 ORB' }, maxPressure: 250e5, ratedFlow: 150 }, params: { crackingPressure: 140, override: 12, ratedFlow: 150 }, notes: 'Supplied at a factory setting – must be adjusted to the equipment specification after installation.' },
  { id: 'rv-60', name: 'Direct-acting relief valve, 60 L/min', componentType: 'relief-valve', partNumber: 'TR-RV60', manufacturer: TRAINING, status: 'simulated-training', specs: { componentType: 'relief-valve', ports: { P: '-10 ORB', T: '-10 ORB' }, maxPressure: 250e5, ratedFlow: 60 }, params: { crackingPressure: 140, override: 12, ratedFlow: 60 } },
  // Directional valves
  { id: 'dv-3w-150-12v', name: '3-way dump valve, 150 L/min, 12 V DC solenoids', componentType: 'dcv', partNumber: 'TR-DV3-150-12', manufacturer: TRAINING, status: 'simulated-training', specs: { componentType: 'dcv', variant: '3way-dump', voltage: 12, ports: { P: '-16 ORB', T: '-20 ORB', A: '-16 ORB' }, ratedFlow: 150, maxPressure: 250e5 }, params: { variant: '3way-dump', ratedFlow: 150, spoolTime: 0.2, actuation: 'solenoid' } },
  { id: 'dv-3w-150-24v', name: '3-way dump valve, 150 L/min, 24 V DC solenoids', componentType: 'dcv', partNumber: 'TR-DV3-150-24', manufacturer: TRAINING, status: 'simulated-training', specs: { componentType: 'dcv', variant: '3way-dump', voltage: 24, ports: { P: '-16 ORB', T: '-20 ORB', A: '-16 ORB' }, ratedFlow: 150, maxPressure: 250e5 }, params: { variant: '3way-dump', ratedFlow: 150, spoolTime: 0.2, actuation: 'solenoid' } },
  { id: 'dv-43t-90-12v', name: '4/3 tandem-centre valve, 90 L/min, 12 V', componentType: 'dcv', partNumber: 'TR-DV43T-90-12', manufacturer: TRAINING, status: 'simulated-training', specs: { componentType: 'dcv', variant: '4-3-tandem', voltage: 12, ports: { P: '-12 ORB', T: '-12 ORB', A: '-12 ORB', B: '-12 ORB' }, ratedFlow: 90, maxPressure: 250e5 }, params: { variant: '4-3-tandem', ratedFlow: 90, spoolTime: 0.15, actuation: 'solenoid' } },
  // Cylinders
  { id: 'tc-3st-140', name: 'Telescopic hoist, 3-stage, 140 mm first stage, 3.0 m stroke', componentType: 'cylinder', partNumber: 'TR-TC3-140-3000', manufacturer: TRAINING, status: 'simulated-training', specs: { componentType: 'cylinder', stages: [140, 120, 100], stroke: 3.0, mountType: 'Trunnion base / pin eye top, 50 mm pins', ports: { A: '-16 ORB' }, maxPressure: 210e5 }, params: { singleActing: true, stages: [140, 120, 100], bore: 140, rod: 90, stroke: 3.0, friction: 6000, sealFriction: 1500, initialPosition: 0 } },
  { id: 'tc-3st-130', name: 'Telescopic hoist, 3-stage, 130 mm first stage, 3.0 m stroke', componentType: 'cylinder', partNumber: 'TR-TC3-130-3000', manufacturer: TRAINING, status: 'simulated-training', specs: { componentType: 'cylinder', stages: [130, 110, 90], stroke: 3.0, mountType: 'Trunnion base / pin eye top, 50 mm pins', ports: { A: '-16 ORB' }, maxPressure: 210e5 }, params: { singleActing: true, stages: [130, 110, 90], bore: 130, rod: 80, stroke: 3.0, friction: 6000, sealFriction: 1500, initialPosition: 0 } },
  { id: 'tc-4st-160', name: 'Telescopic hoist, 4-stage, 160 mm first stage, 4.0 m stroke', componentType: 'cylinder', partNumber: 'TR-TC4-160-4000', manufacturer: TRAINING, status: 'simulated-training', specs: { componentType: 'cylinder', stages: [160, 140, 120, 100], stroke: 4.0, mountType: 'Trunnion base / pin eye top, 60 mm pins', ports: { A: '-20 ORB' }, maxPressure: 210e5 }, params: { singleActing: true, stages: [160, 140, 120, 100], bore: 160, rod: 90, stroke: 4.0, friction: 6000, sealFriction: 1500, initialPosition: 0 } },
  // Filters & coolers & reservoirs
  { id: 'rf-10-150', name: 'Return filter assembly, 10 µm, 150 L/min, 1.7 bar bypass', componentType: 'filter', partNumber: 'TR-RF10-150', manufacturer: TRAINING, status: 'simulated-training', specs: { componentType: 'filter', micron: 10, ratedFlow: 150, ports: { IN: '-20 ORB', OUT: '-20 ORB' } }, params: { cleanDp: 0.35, ratedFlow: 150, bypass: 1.7, micron: 10, initialClog: 0.02 } },
  { id: 'rf-25-150', name: 'Return filter assembly, 25 µm, 150 L/min', componentType: 'filter', partNumber: 'TR-RF25-150', manufacturer: TRAINING, status: 'simulated-training', specs: { componentType: 'filter', micron: 25, ratedFlow: 150, ports: { IN: '-20 ORB', OUT: '-20 ORB' } }, params: { cleanDp: 0.2, ratedFlow: 150, bypass: 1.7, micron: 25, initialClog: 0.02 } },
  { id: 'oc-150', name: 'Air-blast oil cooler, 150 L/min', componentType: 'cooler', partNumber: 'TR-OC150', manufacturer: TRAINING, status: 'simulated-training', specs: { componentType: 'cooler', ratedFlow: 150, ports: { IN: '-20 ORB', OUT: '-20 ORB' } }, params: { dpRated: 0.5, ratedFlow: 150, ua: 220 } },
  { id: 'res-120', name: 'Reservoir 120 L with sight glass and 10 µm breather', componentType: 'reservoir', partNumber: 'TR-RES120', manufacturer: TRAINING, status: 'simulated-training', specs: { componentType: 'reservoir', ports: { S: '-32 flange', R: '-20 ORB', D: '-8 ORB' } }, params: { capacity: 120, initialVolume: 95, height: 0.6, pickupHeight: 0.05, minLevelMark: 0.6 } },
];

export interface HosePart {
  id: string;
  name: string;
  innerDiameterMm: number;
  workingPressureBar: number;
  construction: 'hose' | 'suction-hose';
  status: VerificationStatus;
}

export const HOSES: HosePart[] = [
  { id: 'h-16-2w', name: '-16 (1") two-wire braid hose, 207 bar WP', innerDiameterMm: 25.4, workingPressureBar: 207, construction: 'hose', status: 'simulated-training' },
  { id: 'h-16-1w', name: '-16 (1") one-wire braid hose, 107 bar WP', innerDiameterMm: 25.4, workingPressureBar: 107, construction: 'hose', status: 'simulated-training' },
  { id: 'h-20-2w', name: '-20 (1¼") two-wire braid hose, 207 bar WP', innerDiameterMm: 31.75, workingPressureBar: 207, construction: 'hose', status: 'simulated-training' },
  { id: 'h-12-2w', name: '-12 (¾") two-wire braid hose, 276 bar WP', innerDiameterMm: 19.05, workingPressureBar: 276, construction: 'hose', status: 'simulated-training' },
  { id: 'h-32-suction', name: '-32 (2") wire-helix suction hose', innerDiameterMm: 50.8, workingPressureBar: 10, construction: 'suction-hose', status: 'simulated-training' },
  { id: 'h-32-return', name: '-32 (2") low-pressure return hose (no helix)', innerDiameterMm: 50.8, workingPressureBar: 20, construction: 'hose', status: 'simulated-training' },
];

export const partById = (id: string) => PARTS.find((p) => p.id === id);
export const partsForType = (type: string) => PARTS.filter((p) => p.componentType === type);

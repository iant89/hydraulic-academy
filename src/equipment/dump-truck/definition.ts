import { hose, conn } from '@/simulation/circuits/library';
import type { MachineDefinition } from '@/simulation/machine/types';

/**
 * Equipment Package 001 – Generic hydraulic dump truck (training configuration).
 *
 * ALL numeric values here are SIMULATED TRAINING VALUES chosen to be
 * representative of a medium-duty single-axle dump truck with a PTO-driven
 * gear pump and a three-stage single-acting telescopic front hoist. They are
 * NOT manufacturer specifications. Real service work must use the applicable
 * manufacturer documentation (see the Equipment Profile system).
 */
export const DUMP_TRUCK_ID = 'generic-dump-truck';

export function dumpTruckDefinition(): MachineDefinition {
  return {
    id: DUMP_TRUCK_ID,
    name: 'Generic hydraulic dump truck (training)',
    engine: { idleRpm: 700, maxRpm: 2100, ptoEngageMaxRpm: 1000, availableTorque: 1100 },
    pto: {
      id: 'pto',
      label: 'Transmission-mounted PTO (electric shift)',
      ratio: 1.3,
      outputRotation: 'ccw',
      ratedTorque: 340,
      shiftTime: 0.6,
      requiresParkingBrake: true,
    },
    pump: 'pump',
    functions: [{ id: 'hoist', label: 'Hoist', valve: 'dcv', actuation: 'solenoid', positive: 'RAISE', negative: 'LOWER', actuator: 'cyl', movementKey: 'velocity' }],
    mainRelief: 'relief',
    flowTestConnection: 'pressure',
    electrical: [
      { id: 'pto-sol', label: 'PTO shift solenoid', device: 'pto-solenoid', coilResistance: 6.0, wireResistance: 0.35, pullInVoltage: 8.5, fuse: 'F12 (15 A)', connector: 'C-PTO (2-pin, at PTO shift cover)' },
      { id: 'raise-sol', label: 'Hoist valve RAISE solenoid (S1)', device: 'dcv-solenoid-a', function: 'hoist', target: 'dcv', coilResistance: 7.2, wireResistance: 0.45, pullInVoltage: 8.5, fuse: 'F14 (10 A)', connector: 'C-DV1 (DIN 43650, valve end A)' },
      { id: 'lower-sol', label: 'Hoist valve LOWER solenoid (S2)', device: 'dcv-solenoid-b', function: 'hoist', target: 'dcv', coilResistance: 7.2, wireResistance: 0.45, pullInVoltage: 8.5, fuse: 'F14 (10 A)', connector: 'C-DV2 (DIN 43650, valve end B)' },
    ],
    mechanisms: [
      {
        type: 'dump-body',
        id: 'body',
        label: 'Dump body',
        cylinder: 'cyl',
        bodyMass: 3200,
        ratedPayload: 13600,
        attach: [3.9, -0.1],
        base: [4.0, -1.4],
        cg: [2.2, 0.8],
        dischargeAngle: 30,
        maxAngle: 50,
        length: 4.9,
      },
    ],
    testPoints: [
      { id: 'TP1', label: 'TP1 – Pump outlet', component: 'pump', port: 'OUT', coupling: 'M16×2 test coupling on pump outlet adapter', location: 'Engine compartment, pump pressure fitting' },
      { id: 'TP2', label: 'TP2 – Hoist cylinder port', component: 'cyl', port: 'A', coupling: 'M16×2 test coupling on cylinder base fitting', location: 'Front of dump body, cylinder base' },
      { id: 'TP3', label: 'TP3 – Pump inlet (vacuum)', component: 'pump', port: 'IN', coupling: '¼" NPT port on suction adapter (compound gauge)', location: 'Engine compartment, pump suction flange' },
      { id: 'TP4', label: 'TP4 – Return filter inlet', component: 'filter', port: 'IN', coupling: 'M16×2 test coupling on filter head', location: 'Frame rail, return filter head' },
    ],
    circuit: {
      id: 'dump-truck-hoist',
      name: 'Dump hoist circuit',
      fluidGrade: 'iso-vg-46',
      specifiedFluidGrade: 'iso-vg-46',
      components: [
        { id: 'tank', type: 'reservoir', label: 'Hydraulic reservoir', partId: 'res-120', params: { capacity: 120, initialVolume: 95, height: 0.6, pickupHeight: 0.05, minLevelMark: 0.6 }, layout: { x: 3, y: 15 } },
        { id: 'pump', type: 'pump-gear', label: 'PTO-driven gear pump', partId: 'gp-70-ccw-sae-b', params: { displacement: 70, ratedSpeed: 2400, rotation: 'ccw', volumetricEfficiency: 0.93, mechanicalEfficiency: 0.88, testPressure: 170, maxPressure: 207, speed: 0 }, layout: { x: 3, y: 10 } },
        { id: 'relief', type: 'relief-valve', label: 'Main relief valve', partId: 'rv-150', params: { crackingPressure: 172, override: 12, ratedFlow: 150 }, layout: { x: 8, y: 6 } },
        { id: 'dcv', type: 'dcv', label: 'Hoist control valve', partId: 'dv-3w-150-12v', params: { variant: '3way-dump', ratedFlow: 150, spoolTime: 0.2, actuation: 'solenoid' }, layout: { x: 13, y: 6 } },
        { id: 'cyl', type: 'cylinder', label: 'Telescopic hoist cylinder', partId: 'tc-3st-140', params: { singleActing: true, stages: [140, 120, 100], bore: 140, rod: 90, stroke: 3.0, friction: 6000, sealFriction: 1500, initialPosition: 0 }, layout: { x: 13, y: 1 } },
        { id: 'filter', type: 'filter', label: 'Return filter (10 µm)', partId: 'rf-10-150', params: { cleanDp: 0.35, ratedFlow: 150, bypass: 1.7, micron: 10, initialClog: 0.08 }, layout: { x: 13, y: 12 } },
        { id: 'cooler', type: 'cooler', label: 'Air-blast oil cooler', partId: 'oc-150', params: { dpRated: 0.5, ratedFlow: 150, ua: 220 }, layout: { x: 8, y: 15 } },
      ],
      connections: [
        conn('suction', 'tank.S', 'pump.IN', 'suction', hose(50.8, 1.2, 10, 'suction-hose'), 'Suction hose (reservoir → pump)'),
        conn('pressure', 'pump.OUT', 'dcv.P', 'pressure', hose(25.4, 2.5, 207), 'Pump pressure hose (pump → valve P)'),
        conn('relief-supply', 'dcv.P', 'relief.P', 'pressure', hose(25.4, 0.3, 207, 'tube'), 'Relief supply (valve inlet → relief P)'),
        conn('relief-return', 'relief.T', 'filter.IN', 'return', hose(25.4, 0.6, 207), 'Relief return (relief T → filter)'),
        conn('work', 'dcv.A', 'cyl.A', 'work', hose(25.4, 3.5, 207), 'Hoist cylinder hose (valve A → cylinder)'),
        conn('return', 'dcv.T', 'filter.IN', 'return', hose(31.75, 1.0, 207), 'Valve return hose (valve T → filter)'),
        conn('filter-out', 'filter.OUT', 'cooler.IN', 'return', hose(31.75, 1.0, 207), 'Filter → cooler'),
        conn('cooler-out', 'cooler.OUT', 'tank.R', 'return', hose(31.75, 1.5, 207), 'Cooler → reservoir return'),
      ],
    },
  };
}

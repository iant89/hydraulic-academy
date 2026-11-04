import { hose, conn } from '@/simulation/circuits/library';
import { CraneMechanism } from '@/simulation/machine/mechanisms';
import type { CraneMechanismConfig, MachineDefinition } from '@/simulation/machine/types';

/**
 * Equipment Package 002 – Generic service truck with a hydraulic telescopic crane.
 *
 * Reuses the same component models as the dump truck. The crane valve bank
 * is a five-section open-centre bank with power-beyond carry-over and manual
 * levers: stabilizer → rotation → boom lift → boom extend → winch. Work ports
 * are open to tank in neutral so the load-holding valves' pilots vent –
 * counterbalance valves on lift, extend and winch; pilot-operated check on
 * the stabilizer. Upstream sections have priority (carry-over closes when a
 * section is shifted).
 *
 * ALL values are SIMULATED TRAINING VALUES – not manufacturer specifications.
 */
export const SERVICE_CRANE_ID = 'generic-service-crane';

export const CRANE_MECHANISM: CraneMechanismConfig = {
  type: 'crane',
  id: 'crane',
  label: 'Telescopic crane',
  liftCylinder: 'cyl-lift',
  extendCylinder: 'cyl-ext',
  winchMotor: 'mot-winch',
  slewMotor: 'mot-slew',
  outriggerCylinder: 'cyl-out',
  liftBase: [0.25, -0.95],
  liftAttach: [1.0, -0.15],
  pivotHeight: 2.65,
  minAngle: -2,
  maxAngle: 75,
  boomLength: 3.3,
  boomMass: 420,
  extensionMass: 130,
  winchGearRatio: 35,
  drumRadius: 0.1,
  maxCable: 12,
  slewGearRatio: 120,
  slewFrictionTorque: 18,
  ratedMoment: 45000,
  maxLoad: 2000,
  a2bDistance: 0.35,
  outriggerContact: 0.35,
  outriggerStiffness: 4e5,
  outriggerShare: 25000,
};

export function serviceCraneDefinition(): MachineDefinition {
  const liftStroke = Math.round(new CraneMechanism(CRANE_MECHANISM).stroke * 1000) / 1000;
  const lever = (id: string, label: string, valve: string, positive: string, negative: string, actuator: string, movementKey: 'velocity' | 'speed' = 'velocity') => ({ id, label, valve, actuation: 'lever' as const, positive, negative, actuator, movementKey });
  return {
    id: SERVICE_CRANE_ID,
    name: 'Generic service truck with telescopic crane (training)',
    engine: { idleRpm: 700, maxRpm: 2600, ptoEngageMaxRpm: 1000, availableTorque: 600 },
    pto: { id: 'pto', label: 'Transmission-mounted PTO (electric shift)', ratio: 1.1, outputRotation: 'cw', ratedTorque: 200, shiftTime: 0.5, requiresParkingBrake: true },
    pump: 'pump',
    mainRelief: 'relief',
    flowTestConnection: 'pressure',
    functions: [
      lever('outrigger', 'Stabilizer', 'dcv-out', 'DOWN', 'UP', 'cyl-out'),
      lever('slew', 'Rotation', 'dcv-slew', 'CW', 'CCW', 'mot-slew', 'speed'),
      lever('lift', 'Boom lift', 'dcv-lift', 'UP', 'DOWN', 'cyl-lift'),
      lever('extend', 'Boom extend', 'dcv-ext', 'OUT', 'IN', 'cyl-ext'),
      lever('winch', 'Winch', 'dcv-winch', 'UP', 'DOWN', 'mot-winch', 'speed'),
    ],
    electrical: [{ id: 'pto-sol', label: 'PTO shift solenoid', device: 'pto-solenoid', coilResistance: 6.0, wireResistance: 0.3, pullInVoltage: 8.5, fuse: 'F8 (15 A)', connector: 'C-PTO (2-pin, at PTO shift cover)' }],
    mechanisms: [CRANE_MECHANISM],
    testPoints: [
      { id: 'TP1', label: 'TP1 – Pump outlet', component: 'pump', port: 'OUT', coupling: 'M16×2 test coupling on valve bank inlet', location: 'Crane valve bank inlet' },
      { id: 'TP2', label: 'TP2 – Boom lift cylinder (load side)', component: 'cyl-lift', port: 'A', coupling: 'M16×2 test coupling on counterbalance block', location: 'Lift cylinder base' },
      { id: 'TP3', label: 'TP3 – Winch motor (hoist side)', component: 'mot-winch', port: 'A', coupling: 'M16×2 test coupling on winch counterbalance', location: 'Winch at the boom base' },
      { id: 'TP4', label: 'TP4 – Return filter inlet', component: 'filter', port: 'IN', coupling: 'M16×2 test coupling on filter head', location: 'Service body, behind crane' },
      { id: 'TP5', label: 'TP5 – Pump inlet (vacuum)', component: 'pump', port: 'IN', coupling: '¼" NPT on suction adapter (compound gauge)', location: 'Pump suction' },
    ],
    circuit: {
      id: 'service-crane',
      name: 'Service crane circuit',
      fluidGrade: 'iso-vg-32',
      specifiedFluidGrade: 'iso-vg-32',
      components: [
        { id: 'tank', type: 'reservoir', label: 'Hydraulic reservoir', partId: 'res-60', params: { capacity: 60, initialVolume: 50, height: 0.5, pickupHeight: 0.04, minLevelMark: 0.6 }, layout: { x: 1, y: 15 } },
        { id: 'pump', type: 'pump-gear', label: 'PTO-driven gear pump', partId: 'gp-25-cw-sae-a', params: { displacement: 25, ratedSpeed: 3000, rotation: 'cw', volumetricEfficiency: 0.93, mechanicalEfficiency: 0.88, testPressure: 170, maxPressure: 230, speed: 0 }, layout: { x: 1.5, y: 10.5 } },
        { id: 'relief', type: 'relief-valve', label: 'Main relief valve', partId: 'rv-60', params: { crackingPressure: 190, override: 10, ratedFlow: 60 }, layout: { x: 0.5, y: 6.5 } },
        { id: 'dcv-out', type: 'dcv', label: 'Stabilizer section', partId: 'dv-ocpb-60-lever', params: { variant: '4-3-oc-float', ratedFlow: 60, actuation: 'lever', spoolTime: 0.15 }, layout: { x: 3.5, y: 8 } },
        { id: 'dcv-slew', type: 'dcv', label: 'Rotation section', partId: 'dv-ocpb-60-lever', params: { variant: '4-3-oc-float', ratedFlow: 60, actuation: 'lever', spoolTime: 0.15 }, layout: { x: 8, y: 8 } },
        { id: 'dcv-lift', type: 'dcv', label: 'Boom lift section', partId: 'dv-ocpb-60-lever', params: { variant: '4-3-oc-float', ratedFlow: 60, actuation: 'lever', spoolTime: 0.15 }, layout: { x: 12.5, y: 8 } },
        { id: 'dcv-ext', type: 'dcv', label: 'Boom extend section', partId: 'dv-ocpb-60-lever', params: { variant: '4-3-oc-float', ratedFlow: 60, actuation: 'lever', spoolTime: 0.15 }, layout: { x: 17, y: 8 } },
        { id: 'dcv-winch', type: 'dcv', label: 'Winch section', partId: 'dv-ocpb-60-lever', params: { variant: '4-3-oc-float', ratedFlow: 60, actuation: 'lever', spoolTime: 0.15 }, layout: { x: 21.5, y: 8 } },
        { id: 'pc-out', type: 'pilot-check', label: 'Stabilizer lock valve', partId: 'pc-40', params: { pilotRatio: 3, ratedFlow: 40 }, layout: { x: 3.2, y: 4.2 } },
        { id: 'cyl-out', type: 'cylinder', label: 'Stabilizer cylinder', partId: 'cyl-63-36-600', params: { bore: 63, rod: 36, stroke: 0.6, friction: 6000, sealFriction: 400, initialPosition: 0 }, layout: { x: 3.5, y: 0.5 } },
        { id: 'mot-slew', type: 'motor', label: 'Rotation motor', partId: 'mot-100', params: { displacement: 100, volumetricEfficiency: 0.94, mechanicalEfficiency: 0.9, loadTorque: 18 }, layout: { x: 8.3, y: 3 } },
        { id: 'cb-lift', type: 'counterbalance', label: 'Boom lift counterbalance', partId: 'cb-60', params: { setting: 180, pilotRatio: 4, ratedFlow: 60 }, layout: { x: 12.2, y: 4.2 } },
        { id: 'cyl-lift', type: 'cylinder', label: 'Boom lift cylinder', partId: 'cyl-100-56-lift', params: { bore: 100, rod: 56, stroke: liftStroke, friction: 8000, sealFriction: 600, initialPosition: 0 }, layout: { x: 12.5, y: 0.5 } },
        { id: 'cb-ext', type: 'counterbalance', label: 'Boom extend counterbalance', partId: 'cb-60', params: { setting: 120, pilotRatio: 4, ratedFlow: 60 }, layout: { x: 16.7, y: 4.2 } },
        { id: 'cyl-ext', type: 'cylinder', label: 'Boom extension cylinder', partId: 'cyl-63-40-2000', params: { bore: 63, rod: 40, stroke: 2.0, friction: 5000, sealFriction: 500, initialPosition: 0 }, layout: { x: 17, y: 0.5 } },
        { id: 'cb-winch', type: 'counterbalance', label: 'Winch counterbalance', partId: 'cb-60', params: { setting: 140, pilotRatio: 4, ratedFlow: 60 }, layout: { x: 21.2, y: 4.2 } },
        { id: 'mot-winch', type: 'motor', label: 'Winch motor', partId: 'mot-50', params: { displacement: 50, volumetricEfficiency: 0.94, mechanicalEfficiency: 0.9, loadTorque: 3 }, layout: { x: 21.5, y: 2.5 } },
        { id: 'filter', type: 'filter', label: 'Return filter (10 µm)', partId: 'rf-10-60', params: { cleanDp: 0.3, ratedFlow: 60, bypass: 1.7, micron: 10, initialClog: 0.06 }, layout: { x: 26.5, y: 12 } },
      ],
      connections: [
        conn('suction', 'tank.S', 'pump.IN', 'suction', hose(31.75, 1.4, 10, 'suction-hose'), 'Suction hose (reservoir → pump)'),
        conn('pressure', 'pump.OUT', 'dcv-out.P', 'pressure', hose(12.7, 4.5, 276), 'Pump pressure hose (pump → valve bank inlet)'),
        conn('relief-supply', 'pump.OUT', 'relief.P', 'pressure', hose(12.7, 0.3, 276, 'tube'), 'Relief supply'),
        conn('relief-return', 'relief.T', 'filter.IN', 'return', hose(15.9, 1.0, 207), 'Relief return'),
        conn('carry-1', 'dcv-out.PB', 'dcv-slew.P', 'pressure', hose(12.7, 0.1, 276, 'tube'), 'Carry-over: stabilizer → rotation'),
        conn('carry-2', 'dcv-slew.PB', 'dcv-lift.P', 'pressure', hose(12.7, 0.1, 276, 'tube'), 'Carry-over: rotation → lift'),
        conn('carry-3', 'dcv-lift.PB', 'dcv-ext.P', 'pressure', hose(12.7, 0.1, 276, 'tube'), 'Carry-over: lift → extend'),
        conn('carry-4', 'dcv-ext.PB', 'dcv-winch.P', 'pressure', hose(12.7, 0.1, 276, 'tube'), 'Carry-over: extend → winch'),
        conn('carry-out', 'dcv-winch.PB', 'filter.IN', 'return', hose(15.9, 2.0, 207), 'Open-centre carry-over to tank'),
        conn('tg-1', 'dcv-out.T', 'dcv-slew.T', 'return', hose(15.9, 0.1, 207, 'tube'), 'Tank gallery 1'),
        conn('tg-2', 'dcv-slew.T', 'dcv-lift.T', 'return', hose(15.9, 0.1, 207, 'tube'), 'Tank gallery 2'),
        conn('tg-3', 'dcv-lift.T', 'dcv-ext.T', 'return', hose(15.9, 0.1, 207, 'tube'), 'Tank gallery 3'),
        conn('tg-4', 'dcv-ext.T', 'dcv-winch.T', 'return', hose(15.9, 0.1, 207, 'tube'), 'Tank gallery 4'),
        conn('return', 'dcv-winch.T', 'filter.IN', 'return', hose(15.9, 2.0, 207), 'Valve bank return'),
        conn('filter-out', 'filter.OUT', 'tank.R', 'return', hose(15.9, 1.0, 207), 'Filter → reservoir'),
        conn('out-a', 'dcv-out.A', 'pc-out.V', 'work', hose(9.5, 2.5, 276), 'Stabilizer DOWN line'),
        conn('out-load', 'pc-out.L', 'cyl-out.A', 'work', hose(9.5, 0.3, 276, 'tube'), 'Stabilizer lock → cylinder'),
        conn('out-b', 'dcv-out.B', 'cyl-out.B', 'work', hose(9.5, 2.5, 276), 'Stabilizer UP line'),
        conn('out-pilot', 'pc-out.X', 'cyl-out.B', 'pilot', hose(6.4, 0.4, 276), 'Stabilizer lock pilot'),
        conn('slew-a', 'dcv-slew.A', 'mot-slew.A', 'work', hose(9.5, 2.0, 276), 'Rotation CW line'),
        conn('slew-b', 'dcv-slew.B', 'mot-slew.B', 'work', hose(9.5, 2.0, 276), 'Rotation CCW line'),
        conn('lift-a', 'dcv-lift.A', 'cb-lift.V', 'work', hose(12.7, 2.5, 276), 'Boom UP line'),
        conn('lift-load', 'cb-lift.L', 'cyl-lift.A', 'work', hose(12.7, 0.2, 276, 'tube'), 'Lift counterbalance → cylinder'),
        conn('lift-b', 'dcv-lift.B', 'cyl-lift.B', 'work', hose(12.7, 2.5, 276), 'Boom DOWN line'),
        conn('lift-pilot', 'cb-lift.X', 'cyl-lift.B', 'pilot', hose(6.4, 0.4, 276), 'Lift counterbalance pilot'),
        conn('ext-a', 'dcv-ext.A', 'cb-ext.V', 'work', hose(9.5, 4.0, 276), 'Boom OUT line'),
        conn('ext-load', 'cb-ext.L', 'cyl-ext.A', 'work', hose(9.5, 0.2, 276, 'tube'), 'Extend counterbalance → cylinder'),
        conn('ext-b', 'dcv-ext.B', 'cyl-ext.B', 'work', hose(9.5, 4.0, 276), 'Boom IN line'),
        conn('ext-pilot', 'cb-ext.X', 'cyl-ext.B', 'pilot', hose(6.4, 0.4, 276), 'Extend counterbalance pilot'),
        conn('winch-a', 'dcv-winch.A', 'cb-winch.V', 'work', hose(9.5, 3.0, 276), 'Winch UP line'),
        conn('winch-load', 'cb-winch.L', 'mot-winch.A', 'work', hose(9.5, 0.2, 276, 'tube'), 'Winch counterbalance → motor'),
        conn('winch-b', 'dcv-winch.B', 'mot-winch.B', 'work', hose(9.5, 3.0, 276), 'Winch DOWN line'),
        conn('winch-pilot', 'cb-winch.X', 'mot-winch.B', 'pilot', hose(6.4, 0.4, 276), 'Winch counterbalance pilot'),
      ],
    },
  };
}

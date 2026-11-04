import type { EquipmentProfile } from '@/equipment/shared/types';

const SIM = 'simulated-training' as const;

/**
 * Built-in equipment profiles. These are GENERIC TRAINING CONFIGURATIONS –
 * every value is tagged "simulated-training". No manufacturer data has been
 * invented. Users can create manufacturer-specific profiles in the Profile
 * Editor and attach the source documents that verify each specification.
 */
export const BUILTIN_PROFILES: EquipmentProfile[] = [
  {
    id: 'generic-dt-15',
    manufacturer: 'Generic (training)',
    name: 'Single-axle dump truck – 15 t payload',
    model: 'HA-DT15 (training model)',
    modelYear: 'n/a',
    category: 'dump-truck',
    serialApplicability: 'Training configuration – not tied to real serial numbers',
    engine: 'Diesel, transmission-mounted PTO aperture',
    environment: 'Construction / aggregates',
    template: 'dump-truck',
    generic: true,
    description: 'Equipment Package 001. Gear pump on an electric-shift PTO, 3-way dump valve with main relief, 3-stage telescopic front hoist.',
    overrides: {},
    specs: {
      'pump.displacement': { value: 70, unit: 'cm³/rev', status: SIM },
      'pump.rotation': { value: 'CCW (viewed from shaft end)', status: SIM },
      'pump.maxPressure': { value: 207, unit: 'bar', status: SIM },
      'pto.ratio': { value: 1.3, unit: '× engine', status: SIM },
      'pto.engageMax': { value: 1000, unit: 'rpm', status: SIM },
      'relief.setting': { value: 172, unit: 'bar (cracking)', status: SIM, note: 'Expect ≈178–185 bar at TP1 at full flow (override).' },
      'cyl.stages': { value: '140 / 120 / 100 mm, 3.0 m stroke', status: SIM },
      'tank.capacity': { value: 120, unit: 'L', status: SIM },
      'tank.fill': { value: 95, unit: 'L (body lowered)', status: SIM },
      'fluid.grade': { value: 'ISO VG 46 anti-wear', status: SIM },
      'filter.rating': { value: '10 µm, 1.7 bar bypass', status: SIM },
      'raise.time': { value: '≤ 24 s loaded at ≈1200 engine rpm', status: SIM },
      'torque.orb16': { value: 'Training value only', status: SIM, note: 'Real torque values must come from the fitting manufacturer or equipment service manual.' },
    },
    slots: {
      pump: { componentType: 'pump-gear', displacement: 70, rotation: 'ccw', shaft: 'SAE B 13T spline', mount: 'SAE B 2-bolt', ports: { IN: '-24 SAE split flange', OUT: '-16 SAE ORB' }, minPressureRating: 190e5 },
      relief: { componentType: 'relief-valve', ports: { P: '-16 ORB', T: '-16 ORB' }, minFlow: 110 },
      dcv: { componentType: 'dcv', variant: '3way-dump', voltage: 12, ports: { P: '-16 ORB', T: '-20 ORB', A: '-16 ORB' }, minFlow: 110 },
      cyl: { componentType: 'cylinder', stages: [140, 120, 100], stroke: 3.0, mountType: 'Trunnion base / pin eye top, 50 mm pins', ports: { A: '-16 ORB' } },
      filter: { componentType: 'filter', micron: 10, minFlow: 110, ports: { IN: '-20 ORB', OUT: '-20 ORB' } },
      cooler: { componentType: 'cooler', ports: { IN: '-20 ORB', OUT: '-20 ORB' } },
      tank: { componentType: 'reservoir' },
    },
    documents: [
      {
        id: 'doc-generic-schematic',
        title: 'HA-DT15 hoist circuit schematic (training)',
        manufacturer: 'Hydraulic Academy',
        kind: 'hydraulic-schematic',
        equipmentApplicability: 'Training model HA-DT15',
        modelApplicability: 'All',
        revision: 'A',
        publicationDate: '2026-11-04',
        section: 'Schematic sheet 1',
        reference: 'Built into the application',
        status: SIM,
        notes: 'Simulated training document. Not a substitute for manufacturer documentation.',
      },
    ],
    createdBy: 'system',
  },
  {
    id: 'generic-dt-20',
    manufacturer: 'Generic (training)',
    name: 'Tandem-axle dump truck – 20 t payload',
    model: 'HA-DT20 (training model)',
    modelYear: 'n/a',
    category: 'dump-truck',
    serialApplicability: 'Training configuration',
    engine: 'Diesel, transmission-mounted PTO aperture',
    environment: 'Heavy construction',
    template: 'dump-truck',
    generic: true,
    description: 'Same reusable components configured differently: larger pump, 4-stage hoist, larger reservoir, higher relief setting.',
    overrides: {
      pump: { displacement: 90 },
      relief: { crackingPressure: 190 },
      cyl: { stages: [160, 140, 120, 100], bore: 160, stroke: 4.0 },
      tank: { capacity: 160, initialVolume: 130, height: 0.7 },
    },
    machineOverrides: { ratedPayload: 20000 },
    specs: {
      'pump.displacement': { value: 90, unit: 'cm³/rev', status: SIM },
      'pump.rotation': { value: 'CCW (viewed from shaft end)', status: SIM },
      'relief.setting': { value: 190, unit: 'bar (cracking)', status: SIM },
      'cyl.stages': { value: '160 / 140 / 120 / 100 mm, 4.0 m stroke', status: SIM },
      'tank.capacity': { value: 160, unit: 'L', status: SIM },
      'fluid.grade': { value: 'ISO VG 46 anti-wear', status: SIM },
    },
    slots: {
      pump: { componentType: 'pump-gear', displacement: 90, rotation: 'ccw', shaft: 'SAE B 13T spline', mount: 'SAE B 2-bolt', ports: { IN: '-24 SAE split flange', OUT: '-16 SAE ORB' }, minPressureRating: 200e5 },
      relief: { componentType: 'relief-valve', ports: { P: '-16 ORB', T: '-16 ORB' }, minFlow: 140 },
      dcv: { componentType: 'dcv', variant: '3way-dump', voltage: 12, ports: { P: '-16 ORB', T: '-20 ORB', A: '-16 ORB' }, minFlow: 140 },
      cyl: { componentType: 'cylinder', stages: [160, 140, 120, 100], stroke: 4.0, mountType: 'Trunnion base / pin eye top, 60 mm pins', ports: { A: '-20 ORB' } },
      filter: { componentType: 'filter', micron: 10, minFlow: 140, ports: { IN: '-20 ORB', OUT: '-20 ORB' } },
      cooler: { componentType: 'cooler', ports: { IN: '-20 ORB', OUT: '-20 ORB' } },
      tank: { componentType: 'reservoir' },
    },
    documents: [],
    createdBy: 'system',
  },
];

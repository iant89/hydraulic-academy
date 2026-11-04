import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { HINGE } from '@/equipment/dump-truck/model/layout3d';
import { Box, CHROME, Cyl, DARK, Hex, PAINT, STEEL, mat } from '../three/primitives';
import { TruckChassis } from './TruckChassis';
import type { ModelProps } from './Equipment3D';

const BODY = PAINT('#c7882b');
const BODY_DK = PAINT('#a86e25');
const VALVE_RED = PAINT('#b9302a');
const PUMP = mat('#7b8b96', 0.7, 0.35);

/** Detailed hydraulic dump truck: ribbed body with top rail, cab shield and tailgate; telescopic hoist; hydraulic components. */
export function DumpTruckModel({ getMachine, select, mode }: ModelProps) {
  const body = useRef<THREE.Group>(null);
  const load = useRef<THREE.Mesh>(null);
  const stages = useRef<(THREE.Mesh | null)[]>([]);
  const pto = useRef<THREE.Group>(null);
  const pumpShaft = useRef<THREE.Group>(null);
  const fluid = useRef<THREE.Mesh>(null);
  const beacon = useRef<THREE.MeshStandardMaterial>(null);
  const tailgate = useRef<THREE.Group>(null);
  const filterInd = useRef<THREE.MeshStandardMaterial>(null);
  const heap = useMemo(() => new THREE.CylinderGeometry(1.06, 1.5, 0.9, 4, 1).rotateY(Math.PI / 4), []);

  useFrame((_, dt) => {
    const m = getMachine();
    const angle = (m.bodyAngle() * Math.PI) / 180;
    if (body.current) body.current.rotation.z = angle;
    if (tailgate.current) tailgate.current.rotation.z = -Math.min(angle * 0.9, 0.7);
    if (m.body && load.current) {
      const f = m.body.payload / Math.max(1, m.body.cfg.ratedPayload);
      load.current.visible = f > 0.01;
      load.current.scale.set(2.0, Math.max(0.02, f), 1.0);
      load.current.position.set(2.05 - (1 - f) * 1.3, 0.1 + 0.5 * f, 0);
    }
    if (m.body) {
      const cfg = m.body.cfg;
      const base = new THREE.Vector3(HINGE[0] + cfg.base[0], HINGE[1] + cfg.base[1], 0);
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const att = new THREE.Vector3(HINGE[0] + cfg.attach[0] * c - cfg.attach[1] * s, HINGE[1] + cfg.attach[0] * s + cfg.attach[1] * c, 0);
      const dir = att.clone().sub(base);
      const L = dir.length();
      dir.normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const n = stages.current.length;
      const closed = m.body.closedLength;
      for (let i = 0; i < n; i++) {
        const mesh = stages.current[i];
        if (!mesh) continue;
        const start = i === 0 ? 0 : (L - closed) * (i / n) + 0.08 * i;
        const end = i === 0 ? closed : Math.min(L, start + closed - 0.1 * i);
        const len = Math.max(0.05, end - start);
        mesh.position.copy(base.clone().add(dir.clone().multiplyScalar(start + len / 2)));
        mesh.quaternion.copy(q);
        mesh.scale.set(1, len, 1);
      }
    }
    const pumpRpm = Math.abs(m.sim.getInput(m.def.pump, 'speed')) || 0;
    if (pto.current) pto.current.rotation.x += ((m.pto.outputRpm / 60) * Math.PI * 2 * dt) / 8;
    if (pumpShaft.current) pumpShaft.current.rotation.x += ((pumpRpm / 60) * Math.PI * 2 * dt) / 8;
    if (fluid.current) {
      const lvl = Math.max(0.01, m.sim.readout('tank', 'level') || 0);
      fluid.current.scale.y = lvl;
      fluid.current.position.y = 0.62 + (0.46 * lvl) / 2;
    }
    if (beacon.current) beacon.current.emissiveIntensity = m.pto.state === 'engaged' ? 1.2 : 0.05;
    if (filterInd.current) filterInd.current.color.set(m.sim.readout('filter', 'bypassing') === 1 ? '#e5534b' : '#4fb37f');
  });

  const transparent = mode !== 'normal';
  return (
    <group>
      <TruckChassis onEngine={select('ip-engine')} onCab={select('ip-cab-controls')} />
      <mesh position={[6.55, 3.04, 0.6]}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshStandardMaterial ref={beacon} color="#f2a93b" emissive="#f2a93b" emissiveIntensity={0.05} />
      </mesh>
      {/* Subframe & hinge brackets */}
      {[0.45, -0.45].map((z) => (
        <Box key={z} p={[2.0, 1.27, z]} s={[4.9, 0.12, 0.1]} m={DARK} />
      ))}
      {[0.9, -0.9].map((z) => (
        <Box key={z} p={[0, 1.5, z]} s={[0.2, 0.42, 0.08]} m={DARK} />
      ))}
      {/* PTO with output flange */}
      <group onClick={select('ip-pto')}>
        <Box p={[5.0, 0.8, -0.28]} s={[0.32, 0.3, 0.16]} m={mat('#6b7178', 0.6, 0.4)} />
        <Cyl p={[5.0, 0.95, -0.38]} r={0.04} l={0.1} m={DARK} axis="z" />
        <group ref={pto} position={[4.82, 0.8, -0.42]}>
          <Cyl p={[0, 0, 0]} r={0.07} l={0.04} m={STEEL} axis="x" seg={8} />
          <Box p={[0, 0.05, 0]} s={[0.045, 0.02, 0.02]} m={mat('#f2a93b', 0.3, 0.5)} />
        </group>
      </group>
      {/* Gear pump: flange, body, ports */}
      <group onClick={select('ip-pump')}>
        <Box p={[4.74, 0.8, -0.42]} s={[0.04, 0.24, 0.2]} m={PUMP} />
        <Box p={[4.55, 0.8, -0.42]} s={[0.34, 0.2, 0.16]} m={PUMP} />
        <Cyl p={[4.55, 0.92, -0.42]} r={0.045} l={0.06} m={STEEL} />
        <Cyl p={[4.55, 0.66, -0.42]} r={0.06} l={0.06} m={STEEL} />
        <group ref={pumpShaft} position={[4.79, 0.8, -0.42]}>
          <Cyl p={[0, 0, 0]} r={0.03} l={0.05} m={CHROME} axis="x" seg={8} />
          <Box p={[0, 0.03, 0]} s={[0.04, 0.012, 0.012]} m={mat('#f2a93b', 0.3, 0.5)} />
        </group>
        <Box p={[4.45, 0.92, -0.33]} s={[0.1, 0.02, 0.005]} m={mat('#e3e8ee', 0.1, 0.5)} />
      </group>
      {/* Reservoir: tank, sight glass, filler, breather */}
      <group onClick={select('ip-reservoir')}>
        <mesh position={[3.3, 0.85, -0.85]} castShadow material={transparent ? mat('#5f6b73', 0.5, 0.4, { transparent: true, opacity: 0.35 }) : mat('#5f6b73', 0.55, 0.38)}>
          <boxGeometry args={[1.0, 0.5, 0.5]} />
        </mesh>
        <mesh ref={fluid} position={[3.3, 0.75, -0.85]} material={mat('#c9861d', 0.1, 0.3, { transparent: true, opacity: transparent ? 0.75 : 0 })}>
          <boxGeometry args={[0.96, 0.46, 0.46]} />
        </mesh>
        <Box p={[3.3, 0.86, -1.105]} s={[0.07, 0.34, 0.01]} m={mat('#c9861d', 0.1, 0.2, { emissive: '#6b4508', emissiveIntensity: 0.4 })} />
        <Box p={[3.3, 0.86, -1.112]} s={[0.1, 0.38, 0.004]} m={CHROME} />
        <Cyl p={[3.0, 1.13, -0.85]} r={0.06} l={0.06} m={DARK} />
        <Cyl p={[3.6, 1.13, -0.85]} r={0.05} l={0.1} m={mat('#3a6ea5', 0.3, 0.5)} />
        {[2.85, 3.75].map((x) => (
          <Box key={x} p={[x, 0.85, -0.6]} s={[0.05, 0.56, 0.02]} m={DARK} />
        ))}
      </group>
      {/* Return filter with indicator */}
      <group onClick={select('ip-filter')}>
        <Cyl p={[2.4, 0.78, -0.95]} r={0.08} l={0.3} m={mat('#3a6ea5', 0.3, 0.5)} />
        <Box p={[2.4, 0.97, -0.95]} s={[0.2, 0.08, 0.2]} m={STEEL} />
        <mesh position={[2.4, 1.03, -0.95]}>
          <cylinderGeometry args={[0.02, 0.02, 0.04, 10]} />
          <meshStandardMaterial ref={filterInd} color="#4fb37f" emissive="#222" />
        </mesh>
      </group>
      {/* Cooler: core with fins and fan shroud */}
      <group onClick={select('ip-cooler')}>
        <Box p={[1.6, 0.85, -0.98]} s={[0.5, 0.45, 0.06]} m={DARK} />
        {Array.from({ length: 9 }, (_, i) => (
          <Box key={i} p={[1.38 + i * 0.055, 0.85, -1.015]} s={[0.006, 0.42, 0.01]} m={STEEL} cast={false} />
        ))}
        <Cyl p={[1.6, 0.85, -0.92]} r={0.17} l={0.06} m={DARK} axis="z" />
      </group>
      {/* Valve bank: body, solenoid coils with DIN connectors, relief cartridge */}
      <group onClick={select('ip-valve')}>
        <Box p={[3.9, 0.95, 0.55]} s={[0.24, 0.18, 0.2]} m={VALVE_RED} />
        {[4.09, 3.71].map((x) => (
          <group key={x}>
            <Cyl p={[x, 0.95, 0.55]} r={0.045} l={0.14} m={DARK} axis="x" />
            <Box p={[x + Math.sign(x - 3.9) * 0.08, 0.95, 0.55]} s={[0.04, 0.07, 0.07]} m={mat('#202326', 0.2, 0.7)} />
          </group>
        ))}
        {[3.84, 3.96].map((x) => (
          <Hex key={x} p={[x, 1.06, 0.55]} r={0.025} l={0.04} />
        ))}
      </group>
      <group onClick={select('ip-relief')}>
        <Cyl p={[3.65, 0.95, 0.72]} r={0.035} l={0.18} m={mat('#c8a23a', 0.7, 0.3)} axis="z" />
        <Hex p={[3.65, 0.95, 0.83]} r={0.04} l={0.03} axis="z" />
        <Cyl p={[3.65, 0.95, 0.87]} r={0.012} l={0.05} m={CHROME} axis="z" />
      </group>
      {/* Hoist cylinder stages, base trunnion */}
      <group onClick={select('ip-cylinder')}>
        {[0.11, 0.095, 0.08].map((r, i) => (
          <mesh key={i} ref={(el) => void (stages.current[i] = el)} castShadow material={i === 0 ? mat('#3d4248', 0.4, 0.5) : CHROME}>
            <cylinderGeometry args={[r, r, 1, 24]} />
          </mesh>
        ))}
        <Box p={[4.0, 0.35, 0]} s={[0.32, 0.12, 0.5]} m={DARK} />
        <Cyl p={[4.0, 0.36, 0]} r={0.05} l={0.62} m={STEEL} axis="z" />
      </group>
      {/* Dump body: floor, ribbed sides, top rails, front wall, cab shield, tailgate */}
      <group ref={body} position={HINGE} onClick={select('ip-pivots')}>
        <Box p={[2.05, 0.04, 0]} s={[4.9, 0.08, 2.3]} m={BODY_DK} />
        {Array.from({ length: 7 }, (_, i) => (
          <Box key={i} p={[0.0 + i * 0.7, -0.04, 0]} s={[0.08, 0.1, 2.2]} m={DARK} />
        ))}
        {[1.13, -1.13].map((z) => (
          <group key={z}>
            <Box p={[2.05, 0.55, z]} s={[4.9, 1.0, 0.04]} m={BODY} />
            <Cyl p={[2.05, 1.07, z + Math.sign(z) * 0.03]} r={0.05} l={4.9} m={BODY} axis="x" />
            {Array.from({ length: 6 }, (_, i) => (
              <Box key={i} p={[-0.2 + i * 0.9, 0.55, z + Math.sign(z) * 0.035]} s={[0.07, 0.96, 0.05]} m={BODY_DK} />
            ))}
          </group>
        ))}
        <Box p={[4.48, 0.75, 0]} s={[0.06, 1.4, 2.3]} m={BODY} />
        {Array.from({ length: 3 }, (_, i) => (
          <Box key={i} p={[4.53, 0.35 + i * 0.4, 0]} s={[0.05, 0.06, 2.3]} m={BODY_DK} />
        ))}
        <Box p={[4.85, 1.45, 0]} s={[0.8, 0.05, 2.32]} m={BODY} />
        <Box p={[5.24, 1.38, 0]} s={[0.04, 0.16, 2.32]} m={BODY_DK} />
        {/* tailgate hinged at top */}
        <group ref={tailgate} position={[-0.42, 1.05, 0]}>
          <Box p={[0, -0.5, 0]} s={[0.05, 1.0, 2.24]} m={BODY_DK} />
          {[0.8, 0, -0.8].map((z) => (
            <Box key={z} p={[-0.035, -0.5, z]} s={[0.04, 0.95, 0.07]} m={BODY} />
          ))}
          {[1.05, -1.05].map((z) => (
            <Cyl key={z} p={[0, 0, z]} r={0.04} l={0.12} m={STEEL} axis="z" />
          ))}
        </group>
        <mesh ref={load} geometry={heap} position={[2.05, 0.5, 0]} material={mat('#6e6253', 0, 1)} castShadow />
        <Box p={[3.9, -0.08, 0]} s={[0.3, 0.14, 0.4]} m={DARK} />
      </group>
    </group>
  );
}

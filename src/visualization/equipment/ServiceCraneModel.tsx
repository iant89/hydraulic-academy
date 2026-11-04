import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CRANE_AXIS, RESERVOIR_POS, STABILIZER_POS, VALVE_BANK_POS } from '@/equipment/service-crane/model/layout3d';
import { Box, CHROME, Cyl, DARK, Hex, PAINT, STEEL, mat } from '../three/primitives';
import { TruckChassis } from './TruckChassis';
import type { ModelProps } from './Equipment3D';

const BODY = PAINT('#e6e8ea');
const BODY_TRIM = PAINT('#b9bfc5');
const CRANE = PAINT('#f0b429');
const CRANE_DK = PAINT('#c98f12');
const PUMP = mat('#7b8b96', 0.7, 0.35);
const ROPE = mat('#9da3a8', 0.6, 0.5);
const CRATE = mat('#8a6a3f', 0, 0.9);

/** Service body with compartments, telescopic crane, winch, hook, stabilizer and ground-station valve bank. */
export function ServiceCraneModel({ getMachine, select, mode }: ModelProps) {
  const slew = useRef<THREE.Group>(null);
  const boom = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const tip = useRef<THREE.Object3D>(null);
  const hook = useRef<THREE.Group>(null);
  const crate = useRef<THREE.Group>(null);
  const liftBarrel = useRef<THREE.Mesh>(null);
  const liftRod = useRef<THREE.Mesh>(null);
  const drum = useRef<THREE.Group>(null);
  const legInner = useRef<THREE.Group>(null);
  const levers = useRef<(THREE.Group | null)[]>([]);
  const pto = useRef<THREE.Group>(null);
  const fluid = useRef<THREE.Mesh>(null);
  const beacon = useRef<THREE.MeshStandardMaterial>(null);
  const lmiLamp = useRef<THREE.MeshStandardMaterial>(null);
  const cableGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    return g;
  }, []);
  const cableLine = useMemo(() => new THREE.Line(cableGeo, new THREE.LineBasicMaterial({ color: '#c9ced3' })), [cableGeo]);
  const landed = useRef<THREE.Vector3 | null>(null);

  useFrame((_, dt) => {
    const m = getMachine();
    const cr = m.crane;
    const s = m.craneState();
    if (!cr || !s) return;
    const c = cr.cfg;
    const th = (s.boomAngle * Math.PI) / 180;
    if (slew.current) slew.current.rotation.y = -(s.slewAngle * Math.PI) / 180;
    if (boom.current) boom.current.rotation.z = th;
    if (inner.current) inner.current.position.x = s.boomLength - c.boomLength;
    // lift cylinder between base bracket and boom attach (in the slew plane, origin at pivot)
    const base = new THREE.Vector3(c.liftBase[0], c.liftBase[1], 0);
    const att = new THREE.Vector3(c.liftAttach[0] * Math.cos(th) - c.liftAttach[1] * Math.sin(th), c.liftAttach[0] * Math.sin(th) + c.liftAttach[1] * Math.cos(th), 0);
    const dir = att.clone().sub(base);
    const L = dir.length();
    dir.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const barrelLen = cr.closedLength * 0.92;
    if (liftBarrel.current) {
      liftBarrel.current.position.copy(base.clone().add(dir.clone().multiplyScalar(barrelLen / 2)));
      liftBarrel.current.quaternion.copy(q);
      liftBarrel.current.scale.set(1, barrelLen, 1);
    }
    if (liftRod.current) {
      const rodStart = Math.max(0.05, L - cr.closedLength * 0.95);
      const len = L - rodStart + 0.02;
      liftRod.current.position.copy(base.clone().add(dir.clone().multiplyScalar(rodStart + len / 2)));
      liftRod.current.quaternion.copy(q);
      liftRod.current.scale.set(1, len, 1);
    }
    const winchRpm = m.sim.readout(c.winchMotor, 'speed') || 0;
    if (drum.current) drum.current.rotation.z -= ((winchRpm / c.winchGearRatio / 60) * Math.PI * 2 * dt);
    // cable + hook in world space
    if (tip.current && hook.current) {
      const w = new THREE.Vector3();
      tip.current.getWorldPosition(w);
      const hookY = w.y - s.cableOut;
      hook.current.position.set(w.x, Math.max(0.12, hookY), w.z);
      const pos = cableGeo.getAttribute('position') as THREE.BufferAttribute;
      pos.setXYZ(0, w.x, w.y - 0.09, w.z);
      pos.setXYZ(1, w.x, Math.max(0.2, hookY + 0.12), w.z);
      pos.needsUpdate = true;
      if (crate.current) {
        crate.current.visible = cr.hookLoad > 0;
        if (s.loadSuspended) {
          landed.current = null;
          crate.current.position.set(w.x, hookY - 0.62, w.z);
        } else {
          if (!landed.current) landed.current = new THREE.Vector3(w.x, 0, w.z);
          crate.current.position.copy(landed.current);
        }
      }
    }
    if (legInner.current) {
      const x = m.sim.readout(c.outriggerCylinder, 'position') || 0;
      legInner.current.position.y = Math.max(0.02, c.outriggerContact - x + 0.02);
    }
    m.def.functions.forEach((f, i) => {
      const g = levers.current[i];
      if (g) g.rotation.z = -m.command(f.id) * 0.45;
    });
    const pumpRpm = Math.abs(m.sim.getInput(m.def.pump, 'speed')) || 0;
    if (pto.current) pto.current.rotation.x += ((pumpRpm / 60) * Math.PI * 2 * dt) / 8;
    if (fluid.current) {
      const lvl = Math.max(0.01, m.sim.readout('tank', 'level') || 0);
      fluid.current.scale.y = lvl;
      fluid.current.position.y = RESERVOIR_POS[1] - 0.3 + (0.6 * lvl) / 2;
    }
    if (beacon.current) beacon.current.emissiveIntensity = m.pto.state === 'engaged' ? 1.2 : 0.05;
    if (lmiLamp.current) {
      lmiLamp.current.emissive.set(s.lmiCutout || s.a2b ? '#e5534b' : s.momentFraction > 0.85 ? '#e3b341' : '#4fb37f');
      lmiLamp.current.emissiveIntensity = 1.1;
    }
  });

  const transparent = mode !== 'normal';
  const [ax, ay, az] = CRANE_AXIS;
  const P = getMachine().crane?.cfg;
  const pivotY = (P?.pivotHeight ?? 2.65) - ay;
  return (
    <group>
      <TruckChassis cabColor="#e6e8ea" rearDuals={false} onEngine={select('ip-engine')} onCab={select('ip-cab-controls')} />
      <mesh position={[6.55, 3.04, 0.6]}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshStandardMaterial ref={beacon} color="#f2a93b" emissive="#f2a93b" emissiveIntensity={0.05} />
      </mesh>
      {/* Service body: compartments both sides, bed, rear bumper */}
      {[1, -1].map((side) => (
        <group key={side}>
          <Box p={[2.2, 1.68, side * 0.97]} s={[5.4, 0.95, 0.46]} m={BODY} />
          <Box p={[2.2, 2.17, side * 0.97]} s={[5.42, 0.04, 0.5]} m={BODY_TRIM} />
          {[-0.05, 1.35, 2.75, 4.15].map((x, i) => (
            <group key={x}>
              <Box p={[x + 0.6, 1.68, side * 1.205]} s={[1.28, 0.82, 0.015]} m={BODY_TRIM} cast={false} />
              <Box p={[x + 0.6, 1.68, side * 1.215]} s={[0.2, 0.05, 0.02]} m={CHROME} />
              {i === 0 && <Box p={[x + 0.6, 1.25, side * 1.21]} s={[1.2, 0.02, 0.02]} m={DARK} cast={false} />}
            </group>
          ))}
          {[4.6, 2.2, -0.2].map((x) => (
            <Box key={x} p={[x, 2.1, side * 1.215]} s={[0.05, 0.03, 0.01]} m={mat('#ffb347', 0.1, 0.3, { emissive: '#ff9b2a', emissiveIntensity: 0.5 })} cast={false} />
          ))}
        </group>
      ))}
      <Box p={[2.2, 1.27, 0]} s={[5.4, 0.06, 1.48]} m={mat('#9aa0a6', 0.7, 0.45)} />
      <Box p={[4.92, 1.75, 0]} s={[0.05, 0.9, 1.48]} m={BODY} />
      <Box p={[-0.52, 0.95, 0]} s={[0.14, 0.18, 2.4]} m={DARK} />
      {/* Reservoir (behind cab) with sight glass and return filter */}
      <group onClick={select('ip-reservoir')}>
        <mesh position={RESERVOIR_POS} castShadow material={transparent ? mat('#5f6b73', 0.5, 0.4, { transparent: true, opacity: 0.35 }) : mat('#5f6b73', 0.55, 0.38)}>
          <boxGeometry args={[0.3, 0.64, 0.6]} />
        </mesh>
        <mesh ref={fluid} position={RESERVOIR_POS} material={mat('#c9861d', 0.1, 0.3, { transparent: true, opacity: transparent ? 0.75 : 0 })}>
          <boxGeometry args={[0.28, 0.6, 0.58]} />
        </mesh>
        <Box p={[RESERVOIR_POS[0] - 0.155, RESERVOIR_POS[1], RESERVOIR_POS[2] + 0.18]} s={[0.01, 0.4, 0.06]} m={mat('#c9861d', 0.1, 0.2, { emissive: '#6b4508', emissiveIntensity: 0.4 })} />
        <Cyl p={[4.95, 1.72, 0.48]} r={0.065} l={0.26} m={mat('#3a6ea5', 0.3, 0.5)} />
        <Box p={[4.95, 1.88, 0.48]} s={[0.16, 0.06, 0.16]} m={STEEL} />
      </group>
      {/* PTO + pump */}
      <group onClick={select('ip-pto')}>
        <Box p={[5.0, 0.8, -0.28]} s={[0.32, 0.3, 0.16]} m={mat('#6b7178', 0.6, 0.4)} />
        <Box p={[4.74, 0.8, -0.42]} s={[0.04, 0.2, 0.17]} m={PUMP} />
        <Box p={[4.56, 0.8, -0.42]} s={[0.3, 0.17, 0.14]} m={PUMP} />
        <group ref={pto} position={[4.79, 0.8, -0.42]}>
          <Cyl p={[0, 0, 0]} r={0.03} l={0.05} m={CHROME} axis="x" seg={8} />
          <Box p={[0, 0.03, 0]} s={[0.04, 0.012, 0.012]} m={mat('#f2a93b', 0.3, 0.5)} />
        </group>
      </group>
      {/* Ground-station valve bank with levers and LMI lamp */}
      <group onClick={select('ip-valvebank')} position={VALVE_BANK_POS}>
        <Box p={[0, 0, 0]} s={[0.5, 0.2, 0.14]} m={mat('#b9302a', 0.4, 0.45)} />
        {Array.from({ length: 5 }, (_, i) => (
          <group key={i}>
            <Box p={[-0.2 + i * 0.1, 0, -0.072]} s={[0.003, 0.2, 0.003]} m={DARK} cast={false} />
            <group ref={(el) => void (levers.current[i] = el)} position={[-0.2 + i * 0.1, 0.1, -0.03]}>
              <Cyl p={[0, 0.14, 0]} r={0.008} l={0.28} m={CHROME} />
              <mesh position={[0, 0.29, 0]} material={mat('#111', 0.1, 0.7)}>
                <sphereGeometry args={[0.025, 10, 10]} />
              </mesh>
            </group>
          </group>
        ))}
        <mesh position={[0.32, 0.12, -0.04]}>
          <sphereGeometry args={[0.03, 10, 10]} />
          <meshStandardMaterial ref={lmiLamp} color="#333" emissive="#4fb37f" />
        </mesh>
        <Box p={[0.32, 0.0, -0.02]} s={[0.12, 0.18, 0.08]} m={DARK} />
      </group>
      {/* Stabilizer: housing + extending leg with pad */}
      <group position={[STABILIZER_POS[0], 0, STABILIZER_POS[1]]} onClick={select('ip-stabilizer')}>
        <Box p={[0, 0.95, 0]} s={[0.18, 0.7, 0.18]} m={CRANE} />
        <Box p={[0.15, 1.2, 0.08]} s={[0.12, 0.08, 0.1]} m={DARK} />
        <group ref={legInner}>
          <Box p={[0, 0.5, 0]} s={[0.13, 0.95, 0.13]} m={mat('#c8ccd0', 0.8, 0.3)} />
          <Box p={[0, 0.02, 0]} s={[0.36, 0.04, 0.36]} m={DARK} />
        </group>
      </group>
      {/* Crane: pedestal, slew bearing, mast, boom, extension, winch, lift cylinder */}
      <group position={[ax, ay, az]}>
        <Cyl p={[0, -0.32, 0]} r={0.16} l={0.7} m={CRANE_DK} />
        <group ref={slew} onClick={select('ip-turret')}>
          <Cyl p={[0, 0.05, 0]} r={0.3} l={0.1} m={DARK} seg={32} />
          {Array.from({ length: 12 }, (_, i) => (
            <Hex key={i} p={[Math.cos((i / 12) * Math.PI * 2) * 0.26, 0.11, Math.sin((i / 12) * Math.PI * 2) * 0.26]} r={0.015} l={0.02} />
          ))}
          <Box p={[0, 0.32, 0]} s={[0.34, 0.45, 0.36]} m={CRANE} />
          <Box p={[0.12, -0.32, 0]} s={[0.3, 0.16, 0.24]} m={CRANE_DK} />
          <Cyl p={[-0.1, 0.25, 0.22]} r={0.08} l={0.12} m={DARK} axis="z" />
          {[0.14, -0.14].map((z) => (
            <Box key={z} p={[0, pivotY, z]} s={[0.22, 0.2, 0.04]} m={CRANE} />
          ))}
          <Cyl p={[0, pivotY, 0]} r={0.035} l={0.34} m={STEEL} axis="z" />
          <group position={[0, pivotY, 0]}>
            {/* lift cylinder (in the slew plane, pivot origin) */}
            <group onClick={select('ip-lift')}>
              <mesh ref={liftBarrel} material={mat('#3d4248', 0.4, 0.5)} castShadow>
                <cylinderGeometry args={[0.07, 0.07, 1, 20]} />
              </mesh>
              <mesh ref={liftRod} material={CHROME} castShadow>
                <cylinderGeometry args={[0.04, 0.04, 1, 16]} />
              </mesh>
              <Box p={[P?.liftBase[0] ?? 0.25, (P?.liftBase[1] ?? -0.95) + 0.02, 0]} s={[0.12, 0.08, 0.24]} m={CRANE_DK} />
            </group>
            <group ref={boom} onClick={select('ip-boom')}>
              <Box p={[1.4, 0.0, 0]} s={[3.35, 0.27, 0.23]} m={CRANE} />
              <Box p={[1.4, 0.14, 0]} s={[3.35, 0.015, 0.2]} m={CRANE_DK} cast={false} />
              <Box p={[(P?.liftAttach[0] ?? 1) + 0.0, -0.17, 0]} s={[0.16, 0.08, 0.2]} m={CRANE_DK} />
              <group ref={inner}>
                <Box p={[(P?.boomLength ?? 3.3) - 1.25, 0, 0]} s={[2.6, 0.19, 0.16]} m={CRANE_DK} />
                <Box p={[P?.boomLength ?? 3.3, -0.02, 0]} s={[0.26, 0.26, 0.17]} m={CRANE} />
                <Cyl p={[P?.boomLength ?? 3.3, -0.02, 0]} r={0.09} l={0.06} m={STEEL} axis="z" />
                <object3D ref={tip} position={[P?.boomLength ?? 3.3, 0, 0]} />
                <Box p={[P?.boomLength ?? 3.3, -0.25, 0.06]} s={[0.03, 0.18, 0.03]} m={DARK} />
              </group>
              {/* winch on the boom */}
              <group position={[0.45, 0.24, 0]} onClick={select('ip-winch')}>
                {[0.13, -0.13].map((z) => (
                  <Box key={z} p={[0, -0.06, z]} s={[0.2, 0.18, 0.02]} m={CRANE_DK} />
                ))}
                <group ref={drum}>
                  <Cyl p={[0, 0, 0]} r={0.1} l={0.22} m={ROPE} axis="z" />
                  <Box p={[0, 0.09, 0]} s={[0.04, 0.03, 0.23]} m={DARK} />
                </group>
                <Cyl p={[-0.18, 0, 0.12]} r={0.06} l={0.1} m={DARK} axis="z" />
              </group>
              <Box p={[1.95, 0.155, 0]} s={[2.95, 0.012, 0.012]} m={ROPE} cast={false} />
            </group>
          </group>
        </group>
      </group>
      <primitive object={cableLine} />
      <group ref={hook}>
        <Box p={[0, 0.0, 0]} s={[0.14, 0.2, 0.08]} m={CRANE} />
        <mesh position={[0, -0.18, 0]} rotation={[0, 0, Math.PI / 2]} material={STEEL}>
          <torusGeometry args={[0.06, 0.018, 8, 16, Math.PI * 1.4]} />
        </mesh>
      </group>
      <group ref={crate}>
        <Box p={[0, 0.3, 0]} s={[0.7, 0.6, 0.7]} m={CRATE} />
        <Box p={[0, 0.05, 0]} s={[0.8, 0.1, 0.8]} m={mat('#6b5333', 0, 0.9)} />
        {[[-0.3, -0.3], [0.3, -0.3], [0.3, 0.3], [-0.3, 0.3]].map(([x, z], i) => (
          <Box key={i} p={[x! / 2, 0.85, z! / 2]} s={[0.01, 0.55, 0.01]} m={ROPE} cast={false} r={[z! > 0 ? 0.5 : -0.5, 0, x! > 0 ? -0.5 : 0.5]} />
        ))}
      </group>
    </group>
  );
}

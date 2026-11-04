import { useMemo } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { Box, CHROME, Cyl, DARK, Extrusion, GLASS, PAINT, RUBBER, STEEL, mat, type V3 } from '../three/primitives';

/**
 * Detailed medium-duty truck chassis and conventional cab (visual only).
 * World frame: x forward, y up, z lateral. Front bumper at x ≈ 7.85.
 */
function Wheel({ p, dual = false, side }: { p: V3; dual?: boolean; side: 1 | -1 }) {
  const tire = useMemo(() => {
    const g = new THREE.TorusGeometry(0.38, 0.15, 14, 32);
    return g;
  }, []);
  const lugs = useMemo(() => Array.from({ length: 8 }, (_, i) => [Math.cos((i / 8) * Math.PI * 2) * 0.16, Math.sin((i / 8) * Math.PI * 2) * 0.16] as [number, number]), []);
  const tires = dual ? [-0.14, 0.14] : [0];
  return (
    <group position={p}>
      {tires.map((dz) => (
        <group key={dz} position={[0, 0, dz * side]}>
          <mesh geometry={tire} material={RUBBER} castShadow />
          <Cyl p={[0, 0, 0]} r={0.42} l={0.26} m={RUBBER} axis="z" seg={32} />
          {/* tread grooves */}
          {[-0.07, 0, 0.07].map((g) => (
            <mesh key={g} position={[0, 0, g]} rotation={[0, 0, 0]} material={mat('#0e0f10', 0, 1)}>
              <torusGeometry args={[0.528, 0.006, 4, 48]} />
            </mesh>
          ))}
        </group>
      ))}
      <Cyl p={[0, 0, side * (dual ? 0.28 : 0.14)]} r={0.27} l={0.03} m={STEEL} axis="z" seg={32} />
      <Cyl p={[0, 0, side * (dual ? 0.3 : 0.16)]} r={0.09} l={0.06} m={CHROME} axis="z" />
      {lugs.map(([x, y], i) => (
        <Cyl key={i} p={[x, y, side * (dual ? 0.3 : 0.16)]} r={0.018} l={0.05} m={CHROME} axis="z" seg={6} />
      ))}
    </group>
  );
}

export function TruckChassis({ cabColor = '#c7882b', rearDuals = true, frameEnd = -0.6, onEngine, onCab }: { cabColor?: string; rearDuals?: boolean; frameEnd?: number; onEngine?(e: ThreeEvent<MouseEvent>): void; onCab?(e: ThreeEvent<MouseEvent>): void }) {
  const paint = PAINT(cabColor);
  const frameLen = 7.75 - frameEnd;
  const fx = frameEnd + frameLen / 2;
  return (
    <group>
      {/* C-channel frame rails */}
      {[0.45, -0.45].map((z) => (
        <group key={z}>
          <Box p={[fx, 1.05, z]} s={[frameLen, 0.26, 0.012]} m={DARK} />
          <Box p={[fx, 1.18, z - Math.sign(z) * 0.035]} s={[frameLen, 0.012, 0.08]} m={DARK} />
          <Box p={[fx, 0.92, z - Math.sign(z) * 0.035]} s={[frameLen, 0.012, 0.08]} m={DARK} />
        </group>
      ))}
      {[frameEnd + 0.1, 1.2, 2.6, 4.1, 5.6, 7.0].map((x) => (
        <Box key={x} p={[x, 1.05, 0]} s={[0.1, 0.2, 0.88]} m={DARK} />
      ))}
      {/* Axles, springs */}
      {(rearDuals ? [0.3, 1.6] : [0.9]).concat([6.6]).map((x) => (
        <group key={x}>
          <Cyl p={[x, 0.52, 0]} r={0.07} l={1.9} m={DARK} axis="z" />
          {[0.45, -0.45].map((z) => (
            <Box key={z} p={[x, 0.78, z]} s={[1.1, 0.08, 0.08]} m={STEEL} />
          ))}
          {x < 5 && <Cyl p={[x, 0.52, 0]} r={0.2} l={0.36} m={DARK} axis="z" />}
        </group>
      ))}
      {/* Wheels */}
      {(rearDuals ? [0.3, 1.6] : [0.9]).map((x) =>
        ([1, -1] as const).map((side) => <Wheel key={`${x}${side}`} p={[x, 0.53, side * 0.98]} dual side={side} />),
      )}
      {([1, -1] as const).map((side) => (
        <Wheel key={`f${side}`} p={[6.6, 0.53, side * 1.02]} side={side} />
      ))}
      {/* Front fenders */}
      {([1, -1] as const).map((side) => (
        <mesh key={side} position={[6.6, 0.55, side * 1.02]} rotation={[Math.PI / 2, 0, 0]} material={paint} castShadow>
          <cylinderGeometry args={[0.66, 0.66, 0.4, 24, 1, true, Math.PI / 2 - 0.15, Math.PI + 0.3]} />
        </mesh>
      ))}
      {/* Rear mud flaps */}
      {[1, -1].map((side) => (
        <Box key={side} p={[(rearDuals ? 0.3 : 0.9) - 0.75, 0.45, side * 1.0]} s={[0.02, 0.55, 0.55]} m={RUBBER} />
      ))}
      {/* Cab – extruded side profile */}
      <group onClick={onCab}>
        <Extrusion pts={[[5.45, 1.2], [5.45, 2.98], [6.42, 2.98], [6.62, 2.25], [7.62, 2.05], [7.78, 1.82], [7.78, 1.2]]} depth={2.3} m={paint} />
        {/* windshield and windows */}
        <mesh position={[6.52, 2.62, 0]} rotation={[0, 0, -1.3]} material={GLASS}>
          <planeGeometry args={[0.72, 2.0]} />
        </mesh>
        {[1.151, -1.151].map((z) => (
          <group key={z}>
            <mesh position={[5.98, 2.55, z]} rotation={[0, z > 0 ? 0 : Math.PI, 0]} material={GLASS}>
              <planeGeometry args={[0.85, 0.6]} />
            </mesh>
            <Box p={[5.98, 1.7, z]} s={[0.92, 0.012, 0.006]} m={DARK} cast={false} />
            <Box p={[5.52, 2.0, z]} s={[0.012, 1.5, 0.006]} m={DARK} cast={false} />
            <Box p={[6.42, 2.0, z]} s={[0.012, 1.5, 0.006]} m={DARK} cast={false} />
            <Box p={[6.3, 2.05, z + Math.sign(z) * 0.01]} s={[0.12, 0.03, 0.02]} m={CHROME} />
            {/* steps */}
            <Box p={[5.98, 1.05, z * 1.02]} s={[0.5, 0.04, 0.2]} m={STEEL} />
            {/* mirrors */}
            <Box p={[6.5, 2.5, z + Math.sign(z) * 0.28]} s={[0.04, 0.03, 0.5]} m={DARK} />
            <Box p={[6.5, 2.45, z + Math.sign(z) * 0.55]} s={[0.05, 0.42, 0.2]} m={DARK} />
          </group>
        ))}
        {/* grille, bumper, lights */}
        <Box p={[7.8, 1.55, 0]} s={[0.04, 0.5, 1.2]} m={DARK} />
        {Array.from({ length: 6 }, (_, i) => (
          <Box key={i} p={[7.83, 1.34 + i * 0.08, 0]} s={[0.01, 0.02, 1.15]} m={CHROME} />
        ))}
        <Box p={[7.95, 1.25, 0]} s={[0.18, 0.22, 2.35]} m={CHROME} />
        {[0.85, -0.85].map((z) => (
          <group key={z}>
            <Box p={[7.8, 1.72, z]} s={[0.04, 0.16, 0.26]} m={mat('#fff6d8', 0.1, 0.2, { emissive: '#fff2c4', emissiveIntensity: 0.7 })} />
            <Box p={[7.8, 1.52, z]} s={[0.04, 0.06, 0.18]} m={mat('#ffb347', 0.1, 0.3, { emissive: '#ff9b2a', emissiveIntensity: 0.4 })} />
          </group>
        ))}
        {/* roof marker lights */}
        {[-0.5, -0.25, 0, 0.25, 0.5].map((z) => (
          <Box key={z} p={[6.38, 3.0, z]} s={[0.04, 0.03, 0.06]} m={mat('#ffb347', 0.1, 0.3, { emissive: '#ff9b2a', emissiveIntensity: 0.6 })} />
        ))}
      </group>
      {/* Engine under hood (visible from below), transmission */}
      <group onClick={onEngine}>
        <Box p={[6.75, 1.0, 0]} s={[1.2, 0.62, 0.66]} m={mat('#4a4f55', 0.5, 0.5)} />
        <Box p={[6.75, 1.38, 0]} s={[1.0, 0.18, 0.5]} m={mat('#3a3f45', 0.5, 0.5)} />
        <Box p={[5.3, 0.82, 0]} s={[1.0, 0.42, 0.42]} m={mat('#53585e', 0.6, 0.4)} />
        <Cyl p={[3.0, 0.78, 0]} r={0.05} l={4.4} m={STEEL} axis="x" />
      </group>
      {/* Fuel tank, battery box, exhaust, air tanks */}
      <Cyl p={[4.6, 0.82, 0.78]} r={0.26} l={1.0} m={CHROME} axis="x" />
      {[4.25, 4.95].map((x) => (
        <Cyl key={x} p={[x, 0.82, 0.78]} r={0.268} l={0.05} m={DARK} axis="x" />
      ))}
      <Box p={[5.1, 0.85, -0.82]} s={[0.55, 0.38, 0.42]} m={DARK} />
      <Cyl p={[5.32, 2.3, 0.82]} r={0.065} l={1.9} m={CHROME} />
      <Cyl p={[5.32, 3.3, 0.82]} r={0.07} l={0.12} m={DARK} />
      <Cyl p={[3.2, 0.82, 0.2]} r={0.11} l={0.7} m={mat('#5d646b', 0.5, 0.4)} axis="x" />
      {/* Rear lights / bumper */}
      <Box p={[frameEnd - 0.04, 0.85, 0]} s={[0.1, 0.14, 2.2]} m={DARK} />
      {[0.95, -0.95].map((z) => (
        <Box key={z} p={[frameEnd - 0.1, 0.95, z]} s={[0.03, 0.12, 0.2]} m={mat('#d0302a', 0.1, 0.3, { emissive: '#a01b16', emissiveIntensity: 0.5 })} />
      ))}
    </group>
  );
}

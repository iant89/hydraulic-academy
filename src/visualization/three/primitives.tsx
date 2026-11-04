import { forwardRef, useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';

export type V3 = [number, number, number];
type Click = (e: ThreeEvent<MouseEvent>) => void;

/** Shared PBR material presets (one instance each – cheap to reuse). */
const MATS: Record<string, THREE.MeshStandardMaterial> = {};
export function mat(color: string, metalness = 0.3, roughness = 0.6, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  const k = `${color}|${metalness}|${roughness}|${JSON.stringify(extra)}`;
  if (!MATS[k]) MATS[k] = new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
  return MATS[k]!;
}
export const PAINT = (c: string) => mat(c, 0.35, 0.42);
export const STEEL = mat('#8d949b', 0.85, 0.35);
export const CHROME = mat('#d8dde2', 1, 0.12);
export const RUBBER = mat('#18191b', 0, 0.92);
export const DARK = mat('#2a2e33', 0.4, 0.6);
export const GLASS = mat('#1a2a38', 0.9, 0.05, { transparent: true, opacity: 0.85 });

export function Box({ p, s, m, r, onClick, cast = true }: { p: V3; s: V3; m: THREE.Material; r?: V3; onClick?: Click; cast?: boolean }) {
  return (
    <mesh position={p} rotation={r} castShadow={cast} receiveShadow material={m} onClick={onClick}>
      <boxGeometry args={s} />
    </mesh>
  );
}

/** Cylinder along an axis ('x' | 'y' | 'z'). */
export function Cyl({ p, r, l, m, axis = 'y', seg = 24, onClick, rTop }: { p: V3; r: number; l: number; m: THREE.Material; axis?: 'x' | 'y' | 'z'; seg?: number; onClick?: Click; rTop?: number }) {
  const rot: V3 = axis === 'x' ? [0, 0, Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  return (
    <mesh position={p} rotation={rot} castShadow material={m} onClick={onClick}>
      <cylinderGeometry args={[rTop ?? r, r, l, seg]} />
    </mesh>
  );
}

/** Hex nut / fitting body. */
export function Hex({ p, r, l, axis = 'y' }: { p: V3; r: number; l: number; axis?: 'x' | 'y' | 'z' }) {
  return <Cyl p={p} r={r} l={l} m={STEEL} axis={axis} seg={6} />;
}

/** Orient a unit-height mesh between two points (used for cylinders/rods/struts). */
export function Strut({ a, b, r, m }: { a: V3; b: V3; r: number; m: THREE.Material }) {
  const { pos, quat, len } = useMemo(() => {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const d = vb.clone().sub(va);
    return { pos: va.clone().add(vb).multiplyScalar(0.5), quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()), len: d.length() };
  }, [a, b]);
  return (
    <mesh position={pos} quaternion={quat} castShadow material={m}>
      <cylinderGeometry args={[r, r, len, 14]} />
    </mesh>
  );
}

/** Extruded side profile (x,y points) of thickness `depth` centred on z. */
export const Extrusion = forwardRef<THREE.Mesh, { pts: [number, number][]; depth: number; m: THREE.Material; z?: number; onClick?: Click; bevel?: number }>(function Extrusion({ pts, depth, m, z = 0, onClick, bevel = 0.03 }, ref) {
  const geo = useMemo(() => {
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: depth - bevel * 2, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2 });
    g.translate(0, 0, -(depth - bevel * 2) / 2);
    return g;
  }, [pts, depth, bevel]);
  return <mesh ref={ref} geometry={geo} material={m} position={[0, 0, z]} castShadow receiveShadow onClick={onClick} />;
});

export function Group({ children, p, r }: { children: ReactNode; p?: V3; r?: V3 }) {
  return (
    <group position={p} rotation={r}>
      {children}
    </group>
  );
}

import { useMemo, useRef, type ReactNode } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { MachineSimulation } from '@/simulation/machine/machine';
import type { InspectionPoint } from '@/equipment/shared/types';
import type { LineType } from '@/simulation/hydraulics/types';
import { BAR, circleArea } from '@/simulation/core/units';
import { HOSE_ROUTES as DUMP_ROUTES, IP_Y_OFFSET } from '@/equipment/dump-truck/model/layout3d';
import { CRANE_HOSE_ROUTES } from '@/equipment/service-crane/model/layout3d';
import { TextSprite } from '../three/TextSprite';
import { STEEL } from '../three/primitives';
import { DumpTruckModel } from './DumpTruckModel';
import { ServiceCraneModel } from './ServiceCraneModel';

export type VizMode = 'normal' | 'flow' | 'pressure';

export const LINE_HEX: Record<LineType, string> = {
  pressure: '#e5534b',
  return: '#4a90d9',
  suction: '#3fc1a5',
  pilot: '#e08a3b',
  'case-drain': '#a48bd8',
  'load-sense': '#d4c33f',
  work: '#d77ad3',
};

export interface ModelProps {
  getMachine(): MachineSimulation;
  select(id: string): (e: ThreeEvent<MouseEvent>) => void;
  mode: VizMode;
}

interface Props {
  getMachine(): MachineSimulation;
  points: InspectionPoint[];
  selectedPoint?: string | null;
  onSelectPoint?(id: string): void;
  mode: VizMode;
  showHotspots?: boolean;
  environment?: 'yard' | 'workshop';
  children?: ReactNode;
}

/** 3D equipment scene – picks the model for the machine in the work bay. */
export function Equipment3D(props: Props) {
  const crane = props.getMachine().crane !== null;
  return (
    <Canvas shadows camera={{ position: crane ? [7.5, 6.2, -10.5] : [7.5, 5.2, 11.5], fov: 40 }} dpr={[1, 2]} gl={{ antialias: true, preserveDrawingBuffer: true }} style={{ background: props.environment === 'workshop' ? '#16191d' : '#101317' }}>
      <hemisphereLight args={['#c9d6e3', '#2a2a2a', 0.6]} />
      <directionalLight position={[6, 12, 7]} intensity={1.7} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-10} shadow-camera-right={10} shadow-camera-top={10} shadow-camera-bottom={-10} />
      <directionalLight position={[-6, 4, -6]} intensity={0.45} />
      <Ground workshop={props.environment === 'workshop'} />
      <Scene {...props} />
      {/* Environment children are mirrored for curb-side (crane) views so walls stay behind the equipment. */}
      <group scale={[1, 1, crane ? -1 : 1]}>{props.children}</group>
      <OrbitControls target={crane ? [2.2, 1.7, -0.6] : [3.2, 1.1, 0]} maxPolarAngle={Math.PI / 2.05} minDistance={2.5} maxDistance={24} enableDamping />
    </Canvas>
  );
}

function Ground({ workshop }: { workshop: boolean }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[3, 0, 0]}>
        <planeGeometry args={[44, 32]} />
        <meshStandardMaterial color={workshop ? '#2b2e32' : '#24272b'} roughness={0.95} />
      </mesh>
      {!workshop && <gridHelper args={[44, 44, '#363b41', '#2b2f34']} position={[3, 0.002, 0]} />}
    </group>
  );
}

function Scene({ getMachine, points, selectedPoint, onSelectPoint, mode, showHotspots = true }: Props) {
  const select = (id: string) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelectPoint?.(id);
  };
  const m = getMachine();
  const routes = m.crane ? CRANE_HOSE_ROUTES : DUMP_ROUTES;
  return (
    <group>
      {m.crane ? <ServiceCraneModel getMachine={getMachine} select={select} mode={mode} /> : <DumpTruckModel getMachine={getMachine} select={select} mode={mode} />}
      <HoseSystem getMachine={getMachine} routes={routes} mode={mode} select={(hid) => select(points.find((p) => p.targets.connections?.includes(hid.replace('hose:', '')))?.id ?? hid)} />
      {showHotspots &&
        points.map((ip) => (
          <group key={ip.id} position={[ip.position[0], ip.position[1] + IP_Y_OFFSET, ip.position[2]]}>
            <mesh onClick={select(ip.id)}>
              <sphereGeometry args={[selectedPoint === ip.id ? 0.085 : 0.06, 14, 14]} />
              <meshStandardMaterial color={selectedPoint === ip.id ? '#f2a93b' : '#45b4d6'} emissive={selectedPoint === ip.id ? '#f2a93b' : '#45b4d6'} emissiveIntensity={0.9} transparent opacity={0.9} />
            </mesh>
            {selectedPoint === ip.id && <TextSprite text={ip.label} position={[0, 0.25, 0]} border="#f2a93b" />}
          </group>
        ))}
    </group>
  );
}

function stripeTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 8;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 8);
  g.fillStyle = '#5a5a5a';
  for (let i = 0; i < 64; i += 16) g.fillRect(i, 0, 7, 8);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const heatColor = (pBar: number) => new THREE.Color().setHSL((220 - Math.min(1, Math.max(0, pBar / 220)) * 220) / 360, 0.8, 0.52);

/** Hoses with crimped fittings; in flow/pressure modes a translucent hose shows an animated fluid core. */
function HoseSystem({ getMachine, routes, mode, select }: { getMachine(): MachineSimulation; routes: Record<string, [number, number, number][]>; mode: VizMode; select: ModelProps['select'] }) {
  const m = getMachine();
  const leakRef = useRef<THREE.Points>(null);
  const coreMats = useRef(new Map<string, THREE.MeshStandardMaterial>());
  const hoses = useMemo(
    () =>
      Object.entries(routes)
        .map(([id, pts]) => {
          const conn = m.circuit.connections.find((c) => c.id === id);
          if (!conn || pts.length < 2) return null;
          const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
          const r = Math.max(0.016, conn.hose.innerDiameter * 0.9);
          const tex = stripeTexture();
          tex.repeat.set(Math.max(2, curve.getLength() * 6), 1);
          const ends = [0, 1].map((t) => ({ p: curve.getPoint(t), d: curve.getTangent(t) }));
          return { id, conn, geo: new THREE.TubeGeometry(curve, 48, r, 10, false), core: new THREE.TubeGeometry(curve, 48, r * 0.55, 8, false), tex, mid: curve.getPoint(0.5), ends, r };
        })
        .filter(Boolean) as { id: string; conn: MachineSimulation['circuit']['connections'][number]; geo: THREE.TubeGeometry; core: THREE.TubeGeometry; tex: THREE.CanvasTexture; mid: THREE.Vector3; ends: { p: THREE.Vector3; d: THREE.Vector3 }[]; r: number }[],
    // rebuild when the hydraulic topology changes (flow tester installed, lines re-routed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [routes, m, m.circuit.connections.length],
  );
  const leakGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(90 * 3), 3));
    return g;
  }, []);

  useFrame((_, dt) => {
    const mm = getMachine();
    for (const h of hoses) {
      const q = mm.sim.flowThrough(h.id);
      const v = q / circleArea(h.conn.hose.innerDiameter);
      h.tex.offset.x -= v * dt * 0.8;
      const mat = coreMats.current.get(h.id);
      if (mat) {
        const p = Math.max(mm.sim.pressureAt(h.conn.from.component, h.conn.from.port) || 0, mm.sim.pressureAt(h.conn.to.component, h.conn.to.port) || 0);
        const col = mode === 'pressure' ? heatColor(p / BAR) : new THREE.Color(LINE_HEX[h.conn.lineType]);
        mat.color.copy(col);
        mat.emissive.copy(col).multiplyScalar(Math.abs(q) > 1e-5 ? 0.45 : 0.08);
      }
    }
    if (leakRef.current) {
      const leaks = Object.entries(mm.sim.leakRate).filter(([, q]) => q > 2e-7);
      const pos = leakGeo.getAttribute('position') as THREE.BufferAttribute;
      const t = mm.sim.time;
      for (let i = 0; i < 90; i++) {
        const lk = leaks[i % Math.max(1, leaks.length)];
        if (!lk) {
          pos.setXYZ(i, 0, -10, 0);
          continue;
        }
        const hose = hoses.find((h) => lk[0].startsWith(`hose:${h.id}:`));
        const origin = hose ? hose.mid : new THREE.Vector3(4.0, 1.2, 0.1);
        const ph = (t * 1.7 + i * 0.137) % 1;
        pos.setXYZ(i, origin.x + Math.sin(i * 12.9) * 0.08, origin.y - ph * 0.7, origin.z + Math.cos(i * 7.3) * 0.08 + 0.05);
      }
      pos.needsUpdate = true;
      leakRef.current.visible = leaks.length > 0;
    }
  });

  const transparent = mode !== 'normal';
  return (
    <group>
      {hoses.map((h) => (
        <group key={h.id} onClick={select(`hose:${h.id}`)}>
          <mesh geometry={h.geo} castShadow>
            <meshStandardMaterial color={transparent ? '#c8d4de' : '#141516'} roughness={0.7} transparent={transparent} opacity={transparent ? 0.22 : 1} depthWrite={!transparent} />
          </mesh>
          {transparent && (
            <mesh geometry={h.core}>
              <meshStandardMaterial ref={(mt) => void (mt && coreMats.current.set(h.id, mt))} map={h.tex} color={LINE_HEX[h.conn.lineType]} emissive={LINE_HEX[h.conn.lineType]} emissiveIntensity={0.6} />
            </mesh>
          )}
          {h.ends.map((e, i) => (
            <mesh key={i} position={e.p} quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), e.d.clone().normalize())} material={STEEL}>
              <cylinderGeometry args={[h.r * 1.5, h.r * 1.5, 0.07, 6]} />
            </mesh>
          ))}
        </group>
      ))}
      <points ref={leakRef} geometry={leakGeo}>
        <pointsMaterial color="#d4a33a" size={0.035} transparent opacity={0.85} />
      </points>
    </group>
  );
}

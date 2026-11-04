import { useMemo, useRef, type ReactNode } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { TextSprite } from '../three/TextSprite';
import * as THREE from 'three';
import type { MachineSimulation } from '@/simulation/machine/machine';
import type { InspectionPoint } from '@/equipment/shared/types';
import type { LineType } from '@/simulation/hydraulics/types';
import { BAR, circleArea } from '@/simulation/core/units';
import { HINGE, HOSE_ROUTES, IP_Y_OFFSET } from '@/equipment/dump-truck/model/layout3d';

export type VizMode = 'normal' | 'flow' | 'pressure';

const LINE_HEX: Record<LineType, string> = {
  pressure: '#e5534b',
  return: '#4a90d9',
  suction: '#3fc1a5',
  pilot: '#e08a3b',
  'case-drain': '#a48bd8',
  'load-sense': '#d4c33f',
  work: '#d77ad3',
};

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

export function DumpTruck3D(props: Props) {
  return (
    <Canvas shadows camera={{ position: [7.5, 5.2, 11.5], fov: 40 }} dpr={[1, 2]} gl={{ antialias: true, preserveDrawingBuffer: true }} style={{ background: props.environment === 'workshop' ? '#16191d' : '#101317' }}>
      <hemisphereLight args={['#c9d6e3', '#2a2a2a', 0.65]} />
      <directionalLight position={[6, 10, 6]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-6, 4, -6]} intensity={0.4} />
      <Ground workshop={props.environment === 'workshop'} />
      <Truck {...props} />
      {props.children}
      <OrbitControls target={[3.2, 1.1, 0]} maxPolarAngle={Math.PI / 2.05} minDistance={2.5} maxDistance={22} enableDamping />
    </Canvas>
  );
}

function Ground({ workshop }: { workshop: boolean }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[3, 0, 0]}>
        <planeGeometry args={[40, 30]} />
        <meshStandardMaterial color={workshop ? '#2a2d31' : '#23262a'} roughness={0.95} />
      </mesh>
      <gridHelper args={[40, 40, '#3a3f45', '#2b2f34']} position={[3, 0.002, 0]} />
      {workshop && (
        <>
          <mesh position={[3, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[5.9, 6.0, 4, 1, Math.PI / 4]} />
            <meshBasicMaterial color="#e3b341" />
          </mesh>
        </>
      )}
    </group>
  );
}

function Box({ p, s, color, metal = 0.3, rough = 0.6, onClick, name }: { p: [number, number, number]; s: [number, number, number]; color: string; metal?: number; rough?: number; onClick?(e: ThreeEvent<MouseEvent>): void; name?: string }) {
  return (
    <mesh position={p} castShadow receiveShadow onClick={onClick} name={name}>
      <boxGeometry args={s} />
      <meshStandardMaterial color={color} metalness={metal} roughness={rough} />
    </mesh>
  );
}

function Cyl({ p, r, l, color, rot = [0, 0, Math.PI / 2], onClick }: { p: [number, number, number]; r: number; l: number; color: string; rot?: [number, number, number]; onClick?(e: ThreeEvent<MouseEvent>): void }) {
  return (
    <mesh position={p} rotation={rot} castShadow onClick={onClick}>
      <cylinderGeometry args={[r, r, l, 24]} />
      <meshStandardMaterial color={color} metalness={0.5} roughness={0.4} />
    </mesh>
  );
}

function Truck({ getMachine, points, selectedPoint, onSelectPoint, mode, showHotspots = true }: Props) {
  const body = useRef<THREE.Group>(null);
  const load = useRef<THREE.Mesh>(null);
  const stages = useRef<(THREE.Mesh | null)[]>([]);
  const pto = useRef<THREE.Group>(null);
  const pumpShaft = useRef<THREE.Mesh>(null);
  const fluid = useRef<THREE.Mesh>(null);
  const leakRef = useRef<THREE.Points>(null);
  const beacon = useRef<THREE.MeshStandardMaterial>(null);
  const select = (id: string) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelectPoint?.(id);
  };

  const hoses = useMemo(() => {
    const m = getMachine();
    return Object.entries(HOSE_ROUTES)
      .map(([id, pts]) => {
        const conn = m.circuit.connections.find((c) => c.id === id);
        if (!conn) return null;
        const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
        const r = Math.max(0.018, conn.hose.innerDiameter * 0.9);
        const geo = new THREE.TubeGeometry(curve, 48, r, 10, false);
        const core = new THREE.TubeGeometry(curve, 48, r * 0.55, 8, false);
        const tex = stripeTexture();
        tex.repeat.set(Math.max(2, curve.getLength() * 6), 1);
        return { id, conn, geo, core, tex, len: curve.getLength(), mid: curve.getPoint(0.5) };
      })
      .filter(Boolean) as { id: string; conn: ReturnType<MachineSimulation['circuit']['connections']['find']> & object; geo: THREE.TubeGeometry; core: THREE.TubeGeometry; tex: THREE.CanvasTexture; len: number; mid: THREE.Vector3 }[];
    // Rebuild when the hydraulic topology changes (e.g. flow tester installed)
  }, [getMachine, getMachine().circuit.connections.length]);
  const coreMats = useRef(new Map<string, THREE.MeshStandardMaterial>());

  const leakGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(90 * 3), 3));
    return g;
  }, []);

  useFrame((_, dt) => {
    const m = getMachine();
    const angle = (m.bodyAngle() * Math.PI) / 180;
    if (body.current) body.current.rotation.z = angle;
    if (m.body && load.current) {
      const f = m.body.payload / Math.max(1, m.body.cfg.ratedPayload);
      load.current.visible = f > 0.01;
      load.current.scale.set(1, Math.max(0.02, f), 1);
      load.current.position.set(2.05 - (1 - f) * 1.2, 0.08 + 0.45 * f, 0);
    }
    // Telescopic cylinder geometry from the mechanism
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
    // PTO / pump rotation
    const pumpRpm = Math.abs(m.sim.getInput(m.def.pump, 'speed')) || 0;
    if (pto.current) pto.current.rotation.x += ((m.pto.outputRpm / 60) * Math.PI * 2 * dt) / 8;
    if (pumpShaft.current) pumpShaft.current.rotation.x += ((pumpRpm / 60) * Math.PI * 2 * dt) / 8;
    // Reservoir level
    if (fluid.current) {
      const lvl = Math.max(0.01, m.sim.readout('tank', 'level') || 0);
      fluid.current.scale.y = lvl;
      fluid.current.position.y = 0.6 + (0.5 * lvl) / 2;
    }
    // Hoses
    for (const h of hoses) {
      const q = m.sim.flowThrough(h.id);
      const v = q / circleArea(h.conn.hose.innerDiameter);
      h.tex.offset.x -= v * dt * 0.8;
      const mat = coreMats.current.get(h.id);
      if (mat) {
        const p = Math.max(m.sim.pressureAt(h.conn.from.component, h.conn.from.port) || 0, m.sim.pressureAt(h.conn.to.component, h.conn.to.port) || 0);
        const col = mode === 'pressure' ? heatColor(p / BAR) : new THREE.Color(LINE_HEX[h.conn.lineType]);
        mat.color.copy(col);
        mat.emissive.copy(col).multiplyScalar(Math.abs(q) > 1e-5 ? 0.45 : 0.08);
      }
    }
    // Leak spray particles at leaking hoses / cylinder
    if (leakRef.current) {
      const leaks = Object.entries(m.sim.leakRate).filter(([, q]) => q > 2e-7);
      const pos = leakGeo.getAttribute('position') as THREE.BufferAttribute;
      const t = m.sim.time;
      for (let i = 0; i < 90; i++) {
        const lk = leaks[i % Math.max(1, leaks.length)];
        if (!lk) {
          pos.setXYZ(i, 0, -10, 0);
          continue;
        }
        const id = lk[0];
        const hose = hoses.find((h) => id.startsWith(`hose:${h.id}:`));
        const origin = hose ? hose.mid : id.startsWith('cyl') ? new THREE.Vector3(4.0, 1.2, 0.1) : new THREE.Vector3(4.45, 0.8, -0.45);
        const ph = ((t * 1.7 + i * 0.137) % 1);
        pos.setXYZ(i, origin.x + Math.sin(i * 12.9) * 0.08, origin.y - ph * 0.7, origin.z + Math.cos(i * 7.3) * 0.08 + 0.05);
      }
      pos.needsUpdate = true;
      leakRef.current.visible = leaks.length > 0;
    }
    if (beacon.current) beacon.current.emissiveIntensity = m.pto.state === 'engaged' ? 1.2 : 0.05;
  });

  const transparent = mode !== 'normal';
  return (
    <group>
      {/* Chassis */}
      <Box p={[3.5, 1.05, 0.45]} s={[8.4, 0.22, 0.1]} color="#2f3338" />
      <Box p={[3.5, 1.05, -0.45]} s={[8.4, 0.22, 0.1]} color="#2f3338" />
      {[0.0, 2.0, 4.1, 6.0].map((x) => (
        <Box key={x} p={[x, 1.05, 0]} s={[0.12, 0.16, 0.9]} color="#2a2e33" />
      ))}
      {/* Wheels */}
      {[
        [0.3, 1],
        [0.3, -1],
        [1.6, 1],
        [1.6, -1],
        [6.6, 1],
        [6.6, -1],
      ].map(([x, z], i) => (
        <group key={i} position={[x!, 0.52, z! * 0.95]}>
          <Cyl p={[0, 0, 0]} r={0.52} l={0.38} color="#151618" rot={[Math.PI / 2, 0, 0]} />
          <Cyl p={[0, 0, z! * 0.02]} r={0.26} l={0.4} color="#9aa0a6" rot={[Math.PI / 2, 0, 0]} />
        </group>
      ))}
      {/* Cab */}
      <group onClick={select('ip-cab-controls')}>
        <Box p={[6.55, 2.1, 0]} s={[2.0, 1.6, 2.3]} color="#c7882b" metal={0.4} rough={0.45} />
        <Box p={[6.0, 2.45, 0]} s={[0.9, 0.7, 2.32]} color="#1d2a36" metal={0.8} rough={0.15} />
        <Box p={[7.56, 2.35, 0]} s={[0.04, 0.7, 2.0]} color="#1d2a36" metal={0.8} rough={0.15} />
        <mesh position={[6.55, 3.0, 0.6]}>
          <sphereGeometry args={[0.08, 12, 12]} />
          <meshStandardMaterial ref={beacon} color="#f2a93b" emissive="#f2a93b" emissiveIntensity={0.05} />
        </mesh>
        <Box p={[7.5, 1.25, 0]} s={[0.25, 0.35, 2.3]} color="#2a2d31" />
      </group>
      {/* Engine & transmission */}
      <Box p={[6.6, 1.0, 0]} s={[1.2, 0.7, 0.7]} color="#4a4f55" onClick={select('ip-engine')} />
      <Box p={[5.3, 0.8, 0]} s={[1.0, 0.45, 0.45]} color="#53585e" onClick={select('ip-engine')} />
      {/* PTO */}
      <group ref={pto} position={[5.0, 0.8, -0.3]} onClick={select('ip-pto')}>
        <Box p={[0, 0, 0]} s={[0.3, 0.3, 0.18]} color="#6b7178" />
        <Box p={[0, 0, -0.1]} s={[0.05, 0.25, 0.05]} color="#9aa0a6" />
      </group>
      {/* Pump */}
      <group onClick={select('ip-pump')}>
        <Cyl p={[4.55, 0.8, -0.42]} r={0.11} l={0.42} color="#7b8b96" />
        <mesh ref={pumpShaft} position={[4.8, 0.8, -0.42]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.04, 0.04, 0.12, 6]} />
          <meshStandardMaterial color="#d0d4d8" metalness={0.8} />
        </mesh>
      </group>
      {/* Reservoir */}
      <group onClick={select('ip-reservoir')}>
        <mesh position={[3.3, 0.85, -0.85]} castShadow>
          <boxGeometry args={[1.0, 0.5, 0.5]} />
          <meshStandardMaterial color="#5f6b73" metalness={0.5} roughness={0.4} transparent opacity={transparent ? 0.35 : 1} />
        </mesh>
        <mesh ref={fluid} position={[3.3, 0.75, -0.85]}>
          <boxGeometry args={[0.96, 0.5, 0.46]} />
          <meshStandardMaterial color="#c9861d" transparent opacity={transparent ? 0.75 : 0} />
        </mesh>
        <Box p={[3.3, 0.85, -1.11]} s={[0.08, 0.36, 0.01]} color="#c9861d" />
      </group>
      <Cyl p={[2.4, 0.82, -0.95]} r={0.08} l={0.32} color="#3a6ea5" rot={[0, 0, 0]} onClick={select('ip-filter')} />
      <Box p={[1.6, 0.85, -0.98]} s={[0.5, 0.45, 0.06]} color="#4d5258" onClick={select('ip-cooler')} />
      {/* Valve bank */}
      <group onClick={select('ip-valve')}>
        <Box p={[3.9, 0.95, 0.55]} s={[0.22, 0.18, 0.2]} color="#b9302a" />
        <Cyl p={[4.08, 0.95, 0.55]} r={0.045} l={0.14} color="#202326" />
        <Cyl p={[3.72, 0.95, 0.55]} r={0.045} l={0.14} color="#202326" />
      </group>
      <Cyl p={[3.65, 0.95, 0.74]} r={0.035} l={0.18} color="#c8a23a" rot={[Math.PI / 2, 0, 0]} onClick={select('ip-relief')} />
      {/* Hoses */}
      {hoses.map((h) => (
        <group key={h.id} onClick={select(h.id === 'suction' ? 'ip-suction' : h.id === 'work' ? 'ip-cyl-hose' : h.id === 'pressure' ? 'ip-pressure-hose' : h.id.includes('return') || h.id === 'return' ? 'ip-return-lines' : 'ip-filter')}>
          <mesh geometry={h.geo} castShadow>
            <meshStandardMaterial color={transparent ? '#c8d4de' : '#141516'} roughness={0.7} transparent={transparent} opacity={transparent ? 0.22 : 1} depthWrite={!transparent} />
          </mesh>
          {transparent && (
            <mesh geometry={h.core}>
              <meshStandardMaterial
                ref={(mat) => {
                  if (mat) coreMats.current.set(h.id, mat);
                }}
                map={h.tex}
                color={LINE_HEX[h.conn.lineType]}
                emissive={LINE_HEX[h.conn.lineType]}
                emissiveIntensity={0.6}
              />
            </mesh>
          )}
        </group>
      ))}
      {/* Hoist cylinder stages */}
      <group onClick={select('ip-cylinder')}>
        {[0.105, 0.09, 0.075].map((r, i) => (
          <mesh key={i} ref={(el) => void (stages.current[i] = el)} castShadow>
            <cylinderGeometry args={[r, r, 1, 20]} />
            <meshStandardMaterial color={i === 0 ? '#3d4248' : '#c7ccd1'} metalness={i === 0 ? 0.4 : 0.9} roughness={i === 0 ? 0.5 : 0.15} />
          </mesh>
        ))}
        <Box p={[4.0, 0.35, 0]} s={[0.3, 0.12, 0.5]} color="#2a2e33" />
      </group>
      {/* Dump body */}
      <group ref={body} position={HINGE} onClick={select('ip-pivots')}>
        <Box p={[2.05, 0.04, 0]} s={[4.9, 0.08, 2.3]} color="#b97b2a" metal={0.45} rough={0.5} />
        <Box p={[2.05, 0.55, 1.13]} s={[4.9, 1.0, 0.05]} color="#c7882b" metal={0.45} rough={0.5} />
        <Box p={[2.05, 0.55, -1.13]} s={[4.9, 1.0, 0.05]} color="#c7882b" metal={0.45} rough={0.5} />
        <Box p={[4.48, 0.75, 0]} s={[0.06, 1.4, 2.3]} color="#c7882b" metal={0.45} rough={0.5} />
        <Box p={[4.65, 1.35, 0]} s={[0.4, 0.06, 2.3]} color="#b97b2a" />
        <Box p={[-0.38, 0.5, 0]} s={[0.05, 0.9, 2.26]} color="#a86e25" />
        <mesh ref={load} position={[2.05, 0.5, 0]}>
          <boxGeometry args={[4.2, 0.9, 2.15]} />
          <meshStandardMaterial color="#6e6253" roughness={1} />
        </mesh>
        <Box p={[0, -0.02, 0.9]} s={[0.18, 0.12, 0.18]} color="#2a2e33" />
        <Box p={[0, -0.02, -0.9]} s={[0.18, 0.12, 0.18]} color="#2a2e33" />
      </group>
      <points ref={leakRef} geometry={leakGeo}>
        <pointsMaterial color="#d4a33a" size={0.035} transparent opacity={0.85} />
      </points>
      {/* Inspection hotspots */}
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

import { TextSprite } from '../three/TextSprite';

/** Static workshop bay furniture (visual only). */
export function WorkshopProps() {
  const label = (text: string) => <TextSprite text={text} position={[0, 0, 0]} color="#b6bdc5" scale={0.36} />;
  return (
    <group>
      {/* back wall */}
      <mesh position={[3, 3, -5]} receiveShadow>
        <boxGeometry args={[20, 6, 0.2]} />
        <meshStandardMaterial color="#25292e" />
      </mesh>
      {/* workbench */}
      <group position={[2, 0, -3.6]}>
        <mesh position={[0, 0.9, 0]} castShadow>
          <boxGeometry args={[3, 0.08, 1]} />
          <meshStandardMaterial color="#6b4f2e" />
        </mesh>
        {[-1.4, 1.4].map((x) => (
          <mesh key={x} position={[x, 0.45, 0]}>
            <boxGeometry args={[0.08, 0.9, 0.9]} />
            <meshStandardMaterial color="#3a3f45" />
          </mesh>
        ))}
        <mesh position={[0.6, 0.98, 0]}>
          <boxGeometry args={[0.6, 0.1, 0.4]} />
          <meshStandardMaterial color="#3a3f45" />
        </mesh>
        <group position={[0, 1.4, 0]}>{label('Component workbench')}</group>
      </group>
      {/* parts shelving */}
      <group position={[-3.5, 0, -3.8]}>
        {[0.4, 1.1, 1.8].map((y) => (
          <mesh key={y} position={[0, y, 0]}>
            <boxGeometry args={[2, 0.05, 0.8]} />
            <meshStandardMaterial color="#4b525a" />
          </mesh>
        ))}
        {[[-0.6, 0.55], [0.1, 0.55], [0.6, 1.25], [-0.4, 1.95]].map(([x, y], i) => (
          <mesh key={i} position={[x!, y!, 0]}>
            <boxGeometry args={[0.4, 0.25, 0.35]} />
            <meshStandardMaterial color={i % 2 ? '#7b8b96' : '#b9302a'} />
          </mesh>
        ))}
        <group position={[0, 2.4, 0]}>{label('Parts storage')}</group>
      </group>
      {/* tool chest */}
      <group position={[7.5, 0, -3.8]}>
        <mesh position={[0, 0.6, 0]} castShadow>
          <boxGeometry args={[1.4, 1.2, 0.6]} />
          <meshStandardMaterial color="#9e2a24" metalness={0.4} roughness={0.4} />
        </mesh>
        <group position={[0, 1.6, 0]}>{label('Tool storage')}</group>
      </group>
      {/* test station + terminal */}
      <group position={[10, 0, -2]}>
        <mesh position={[0, 0.7, 0]} castShadow>
          <boxGeometry args={[1.2, 1.4, 0.8]} />
          <meshStandardMaterial color="#3a6ea5" />
        </mesh>
        <mesh position={[0, 1.6, -0.2]}>
          <boxGeometry args={[0.8, 0.5, 0.05]} />
          <meshStandardMaterial color="#0f1720" emissive="#1f4d6b" emissiveIntensity={0.6} />
        </mesh>
        <group position={[0, 2.2, 0]}>{label('Hydraulic test station / diagnostic terminal')}</group>
      </group>
      {/* bay markings */}
      <mesh position={[3.4, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[10.5, 3.6]} />
        <meshBasicMaterial color="#e3b341" transparent opacity={0.06} />
      </mesh>
      <group position={[-2.2, 0.2, 2]}>{label('Bay 1 – Hydraulic dump truck')}</group>
    </group>
  );
}

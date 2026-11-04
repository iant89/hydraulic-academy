import { TextSprite } from '../three/TextSprite';
import { Box, CHROME, Cyl, DARK, PAINT, STEEL, mat } from '../three/primitives';

const WALL = mat('#2d3237', 0.1, 0.9);
const WALL_PANEL = mat('#262b30', 0.1, 0.9);
const YELLOW = mat('#e3b341', 0.2, 0.6);
const RED = PAINT('#9e2a24');
const BLUE = PAINT('#3a6ea5');
const WOOD = mat('#6b4f2e', 0, 0.85);
const LIGHT = mat('#f4f7fb', 0, 0.3, { emissive: '#f4f7fb', emissiveIntensity: 1.2 });

function label(text: string, p: [number, number, number]) {
  return <TextSprite text={text} position={p} color="#b6bdc5" scale={0.36} />;
}

/** Workshop bay environment (visual only). */
export function WorkshopProps() {
  return (
    <group>
      {/* walls with panelling, windows and a roller door */}
      <Box p={[3, 3.5, -5.2]} s={[22, 7, 0.2]} m={WALL} />
      {Array.from({ length: 10 }, (_, i) => (
        <Box key={i} p={[-7 + i * 2.2, 3.5, -5.08]} s={[0.06, 7, 0.04]} m={WALL_PANEL} cast={false} />
      ))}
      {[-4, 0, 6, 10].map((x) => (
        <Box key={x} p={[x, 4.8, -5.08]} s={[1.6, 0.9, 0.02]} m={mat('#1d2a36', 0.8, 0.1, { emissive: '#14324a', emissiveIntensity: 0.4 })} cast={false} />
      ))}
      <Box p={[-8, 3.5, 0]} s={[0.2, 7, 10.6]} m={WALL} />
      <Box p={[14, 3.5, 0]} s={[0.2, 7, 10.6]} m={WALL} />
      {/* roller door on the right wall */}
      <Box p={[13.88, 2.3, 0]} s={[0.05, 4.6, 4.2]} m={mat('#4a5056', 0.6, 0.5)} />
      {Array.from({ length: 14 }, (_, i) => (
        <Box key={i} p={[13.84, 0.2 + i * 0.32, 0]} s={[0.02, 0.03, 4.2]} m={DARK} cast={false} />
      ))}
      {/* ceiling light fixtures */}
      {[0, 3.5, 7].map((x) => (
        <group key={x}>
          <Box p={[x, 6.2, 0]} s={[2.2, 0.08, 0.3]} m={DARK} />
          <Box p={[x, 6.15, 0]} s={[2.0, 0.03, 0.22]} m={LIGHT} cast={false} />
          <pointLight position={[x, 5.8, 0]} intensity={6} distance={9} decay={1.6} color="#f2f5ff" />
        </group>
      ))}
      {/* bay floor markings, drain, oil stains */}
      {[
        [3.4, 1.85, 10.6, 0.08],
        [3.4, -1.85, 10.6, 0.08],
        [-1.85, 0, 0.08, 3.78],
        [8.65, 0, 0.08, 3.78],
      ].map(([x, z, w, d], i) => (
        <mesh key={i} position={[x!, 0.004, z!]} rotation={[-Math.PI / 2, 0, 0]} material={YELLOW}>
          <planeGeometry args={[w!, d!]} />
        </mesh>
      ))}
      <mesh position={[3, 0.005, 2.6]} rotation={[-Math.PI / 2, 0, 0]} material={DARK}>
        <planeGeometry args={[3, 0.18]} />
      </mesh>
      {[[4.5, 0.4, 0.5], [2.2, -0.3, 0.35]].map(([x, z, r], i) => (
        <mesh key={i} position={[x!, 0.006, z!]} rotation={[-Math.PI / 2, 0, 0]} material={mat('#16181a', 0, 1, { transparent: true, opacity: 0.6 })}>
          <circleGeometry args={[r!, 24]} />
        </mesh>
      ))}
      {/* workbench with vise and tools */}
      <group position={[2, 0, -4.4]}>
        <Box p={[0, 0.92, 0]} s={[3, 0.08, 0.9]} m={WOOD} />
        {[-1.4, 1.4].map((x) => (
          <Box key={x} p={[x, 0.45, 0]} s={[0.08, 0.9, 0.8]} m={DARK} />
        ))}
        <Box p={[0, 0.25, 0]} s={[2.9, 0.04, 0.8]} m={DARK} />
        <Box p={[0, 1.6, -0.42]} s={[3, 1.2, 0.04]} m={mat('#3d4248', 0.3, 0.7)} />
        {Array.from({ length: 8 }, (_, i) => (
          <Box key={i} p={[-1.2 + i * 0.34, 1.6 + (i % 2) * 0.15, -0.38]} s={[0.04, 0.3 + (i % 3) * 0.08, 0.03]} m={i % 3 ? CHROME : RED} />
        ))}
        <Box p={[1.1, 1.06, 0.2]} s={[0.3, 0.2, 0.18]} m={BLUE} />
        <Box p={[1.1, 1.18, 0.2]} s={[0.36, 0.04, 0.12]} m={STEEL} />
        <Box p={[-0.6, 1.0, 0.1]} s={[0.4, 0.08, 0.25]} m={mat('#7b8b96', 0.7, 0.35)} />
        {label('Component workbench', [0, 2.45, 0])}
      </group>
      {/* parts shelving with bins */}
      <group position={[-5.6, 0, -4.4]}>
        {[0.1, 0.8, 1.5, 2.2].map((y) => (
          <Box key={y} p={[0, y, 0]} s={[2.2, 0.05, 0.8]} m={mat('#4b525a', 0.5, 0.5)} />
        ))}
        {[-1.08, 1.08].map((x) => (
          <Box key={x} p={[x, 1.2, 0]} s={[0.05, 2.4, 0.8]} m={mat('#4b525a', 0.5, 0.5)} />
        ))}
        {Array.from({ length: 12 }, (_, i) => (
          <Box key={i} p={[-0.75 + (i % 4) * 0.5, 0.28 + Math.floor(i / 4) * 0.7, 0]} s={[0.4, 0.3, 0.5]} m={[BLUE, RED, mat('#4fb37f', 0.2, 0.6), mat('#7b8b96', 0.6, 0.4)][i % 4]!} />
        ))}
        {label('Parts storage', [0, 2.75, 0])}
      </group>
      {/* tool chest with drawers */}
      <group position={[6.8, 0, -4.5]}>
        <Box p={[0, 0.7, 0]} s={[1.5, 1.4, 0.65]} m={RED} />
        {Array.from({ length: 6 }, (_, i) => (
          <group key={i}>
            <Box p={[0, 0.2 + i * 0.21, 0.33]} s={[1.4, 0.01, 0.01]} m={DARK} cast={false} />
            <Box p={[0, 0.3 + i * 0.21, 0.34]} s={[0.5, 0.025, 0.02]} m={CHROME} />
          </group>
        ))}
        <Box p={[0, 1.43, 0]} s={[1.52, 0.06, 0.67]} m={DARK} />
        {[[-0.6, 0.08], [0.6, 0.08]].map(([x, y], i) => (
          <Cyl key={i} p={[x!, y!, 0.25]} r={0.06} l={0.05} m={DARK} axis="x" />
        ))}
        {label('Tool storage', [0, 1.9, 0])}
      </group>
      {/* hydraulic test stand with gauges & diagnostic terminal */}
      <group position={[10.6, 0, -3.6]}>
        <Box p={[0, 0.65, 0]} s={[1.4, 1.3, 0.8]} m={BLUE} />
        <Box p={[0, 1.65, -0.25]} s={[1.3, 0.7, 0.06]} m={mat('#2a2e33', 0.4, 0.6)} />
        {[-0.4, 0, 0.4].map((x) => (
          <group key={x}>
            <Cyl p={[x, 1.7, -0.2]} r={0.15} l={0.04} m={CHROME} axis="z" />
            <Cyl p={[x, 1.7, -0.175]} r={0.13} l={0.01} m={mat('#f4f4f4', 0, 0.4)} axis="z" />
          </group>
        ))}
        <Box p={[0.9, 1.5, 0.1]} s={[0.05, 0.6, 0.45]} m={mat('#0f1720', 0.3, 0.3, { emissive: '#1f4d6b', emissiveIntensity: 0.8 })} />
        <Cyl p={[-0.5, 1.32, 0.3]} r={0.03} l={0.6} m={RED} axis="x" />
        {label('Test stand / diagnostic terminal', [0, 2.35, 0])}
      </group>
      {/* oil drums, drain pan, fire extinguisher, wheel chocks */}
      {[[-6.8, 1.5], [-6.1, 1.9], [-6.8, 2.4]].map(([x, z], i) => (
        <group key={i} position={[x!, 0, z!]}>
          <Cyl p={[0, 0.45, 0]} r={0.29} l={0.9} m={i === 1 ? BLUE : mat('#2f6b3b', 0.4, 0.5)} />
          {[0.25, 0.65].map((y) => (
            <Cyl key={y} p={[0, y, 0]} r={0.3} l={0.03} m={DARK} />
          ))}
        </group>
      ))}
      {label('Hydraulic fluid', [-6.5, 1.2, 1.95])}
      <Cyl p={[3.2, 0.04, 0.6]} r={0.45} l={0.08} m={mat('#c9861d', 0.4, 0.4)} />
      <group position={[-7.75, 0, -2]}>
        <Cyl p={[0, 0.9, 0]} r={0.09} l={0.5} m={RED} />
        <Cyl p={[0, 1.2, 0]} r={0.03} l={0.1} m={DARK} />
        <Box p={[0.05, 1.6, 0]} s={[0.02, 0.35, 0.35]} m={mat('#c92a24', 0.1, 0.4)} />
      </group>
      {[[0.3, 1.25], [0.3, -1.25]].map(([x, z], i) => (
        <Box key={i} p={[x! + 0.62, 0.1, z!]} s={[0.25, 0.2, 0.3]} m={YELLOW} r={[0, 0, 0.5]} />
      ))}
      {label('Bay 1', [-2.2, 0.25, 2.3])}
    </group>
  );
}

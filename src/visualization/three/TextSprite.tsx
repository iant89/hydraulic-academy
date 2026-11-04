import { useMemo } from 'react';
import * as THREE from 'three';

/** Billboard text label rendered to a canvas texture (no DOM portals). */
export function TextSprite({ text, position, color = '#e5e8eb', border = '#3a4047', scale = 0.32 }: { text: string; position: [number, number, number]; color?: string; border?: string; scale?: number }) {
  const { tex, aspect } = useMemo(() => {
    const c = document.createElement('canvas');
    const g = c.getContext('2d')!;
    const font = '600 30px system-ui, sans-serif';
    g.font = font;
    const w = Math.ceil(g.measureText(text).width) + 28;
    c.width = w;
    c.height = 48;
    g.font = font;
    g.fillStyle = 'rgba(17,19,22,0.88)';
    g.strokeStyle = border;
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(2, 2, w - 4, 44, 8);
    g.fill();
    g.stroke();
    g.fillStyle = color;
    g.textBaseline = 'middle';
    g.fillText(text, 14, 25);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return { tex: t, aspect: w / 48 };
  }, [text, color, border]);
  return (
    <sprite position={position} scale={[scale * aspect, scale, 1]} renderOrder={10}>
      <spriteMaterial map={tex} depthTest={false} transparent />
    </sprite>
  );
}

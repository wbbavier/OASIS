// Shared hex geometry utilities for map rendering.

import type { TerrainType } from '@/engine/types';

export const HEX_SIZE = 28; // pointy-top radius in px
export const SQRT3 = Math.sqrt(3);

/** Parchment/medieval cartography-inspired palette. */
export const TERRAIN_FILL: Record<TerrainType, string> = {
  plains:    '#D4C8A0', // warm tan
  mountains: '#8A8478', // slate gray
  forest:    '#7A8E6A', // olive
  desert:    '#DAB978', // sandy gold
  coast:     '#A8BFC8', // pale blue-gray
  sea:       '#6A8BA0', // deeper blue-gray
  river:     '#7AAAB8', // blue accent
};

/** Pointy-top hexagon vertices around (cx, cy). */
export function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 90);
    pts.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }
  return pts.join(' ');
}

/** Pixel centre for a hex in odd-r offset (odd rows shift right). */
export function hexCenter(col: number, row: number, r: number): [number, number] {
  const x = col * SQRT3 * r + (row % 2 !== 0 ? (SQRT3 / 2) * r : 0) + r;
  const y = row * 1.5 * r + r;
  return [x, y];
}

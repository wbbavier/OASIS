// SVG terrain glyphs rendered inside hexes.
// Low-contrast, subtle patterns to indicate terrain type without competing with units.

import type { TerrainType } from '@/engine/types';

interface TerrainIconProps {
  terrain: TerrainType;
  cx: number;
  cy: number;
}

function PlainsIcon({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g opacity={0.25}>
      <line x1={cx - 6} y1={cy + 2} x2={cx + 6} y2={cy + 2} stroke="#5A4F3A" strokeWidth={0.8} />
      <line x1={cx - 4} y1={cy + 5} x2={cx + 4} y2={cy + 5} stroke="#5A4F3A" strokeWidth={0.6} />
    </g>
  );
}

function ForestIcon({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g opacity={0.3}>
      <polygon points={`${cx},${cy - 6} ${cx - 4},${cy + 1} ${cx + 4},${cy + 1}`} fill="#3A5530" />
      <polygon points={`${cx - 5},${cy - 2} ${cx - 9},${cy + 5} ${cx - 1},${cy + 5}`} fill="#3A5530" />
      <polygon points={`${cx + 5},${cy - 2} ${cx + 1},${cy + 5} ${cx + 9},${cy + 5}`} fill="#3A5530" />
    </g>
  );
}

function MountainIcon({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g opacity={0.3}>
      <polygon points={`${cx},${cy - 7} ${cx - 7},${cy + 4} ${cx + 7},${cy + 4}`} fill="none" stroke="#4A453E" strokeWidth={1.2} />
      <polygon points={`${cx},${cy - 7} ${cx - 3},${cy - 1} ${cx + 3},${cy - 1}`} fill="#AAA49A" opacity={0.5} />
    </g>
  );
}

function DesertIcon({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g opacity={0.2}>
      <path d={`M${cx - 8},${cy + 3} Q${cx - 4},${cy - 1} ${cx},${cy + 3} Q${cx + 4},${cy + 7} ${cx + 8},${cy + 3}`} fill="none" stroke="#8A7040" strokeWidth={0.8} />
      <circle cx={cx + 3} cy={cy - 4} r={1.5} fill="#8A7040" />
    </g>
  );
}

function CoastIcon({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g opacity={0.25}>
      <path d={`M${cx - 8},${cy + 1} Q${cx - 4},${cy - 2} ${cx},${cy + 1} Q${cx + 4},${cy + 4} ${cx + 8},${cy + 1}`} fill="none" stroke="#5A7888" strokeWidth={0.7} />
      <path d={`M${cx - 6},${cy + 4} Q${cx - 2},${cy + 1} ${cx + 2},${cy + 4} Q${cx + 6},${cy + 7} ${cx + 8},${cy + 4}`} fill="none" stroke="#5A7888" strokeWidth={0.5} />
    </g>
  );
}

function SeaIcon({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g opacity={0.2}>
      <path d={`M${cx - 9},${cy - 2} Q${cx - 5},${cy - 5} ${cx - 1},${cy - 2} Q${cx + 3},${cy + 1} ${cx + 7},${cy - 2}`} fill="none" stroke="#3A5568" strokeWidth={0.7} />
      <path d={`M${cx - 7},${cy + 2} Q${cx - 3},${cy - 1} ${cx + 1},${cy + 2} Q${cx + 5},${cy + 5} ${cx + 9},${cy + 2}`} fill="none" stroke="#3A5568" strokeWidth={0.7} />
    </g>
  );
}

function RiverIcon({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g opacity={0.3}>
      <path d={`M${cx},${cy - 8} Q${cx + 4},${cy - 3} ${cx - 2},${cy + 2} Q${cx + 3},${cy + 6} ${cx},${cy + 8}`} fill="none" stroke="#4A8898" strokeWidth={1.2} strokeLinecap="round" />
    </g>
  );
}

export function TerrainIcon({ terrain, cx, cy }: TerrainIconProps) {
  switch (terrain) {
    case 'plains':    return <PlainsIcon cx={cx} cy={cy} />;
    case 'forest':    return <ForestIcon cx={cx} cy={cy} />;
    case 'mountains': return <MountainIcon cx={cx} cy={cy} />;
    case 'desert':    return <DesertIcon cx={cx} cy={cy} />;
    case 'coast':     return <CoastIcon cx={cx} cy={cy} />;
    case 'sea':       return <SeaIcon cx={cx} cy={cy} />;
    case 'river':     return <RiverIcon cx={cx} cy={cy} />;
  }
}

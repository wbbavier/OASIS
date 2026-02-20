'use client';
import type { Hex, TerrainType } from '@/engine/types';

const HEX_SIZE = 22; // pointy-top radius in px
const SQRT3 = Math.sqrt(3);

const TERRAIN_FILL: Record<TerrainType, string> = {
  plains:    '#C8B97A',
  mountains: '#7A7060',
  forest:    '#4A6741',
  desert:    '#D4A96A',
  coast:     '#6AA0B0',
  sea:       '#2E5F8A',
  river:     '#5898AA',
};

/** Pointy-top hexagon vertices around (cx, cy). */
function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 90);
    pts.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }
  return pts.join(' ');
}

/** Pixel centre for a hex in odd-r offset (odd rows shift right). */
function hexCenter(col: number, row: number, r: number): [number, number] {
  const x = col * SQRT3 * r + (row % 2 !== 0 ? (SQRT3 / 2) * r : 0) + r;
  const y = row * 1.5 * r + r;
  return [x, y];
}

interface HexMapProps {
  map: Hex[][];
  /** civId of the current player — used for fog of war. Null = spectator (see all). */
  currentCivId: string | null;
  /** civId → hex color (from theme) */
  civColors: Record<string, string>;
  onHexClick?: (hex: Hex) => void;
}

export function HexMap({ map, currentCivId, civColors, onHexClick }: HexMapProps) {
  const rows = map.length;
  const cols = rows > 0 ? (map[0]?.length ?? 0) : 0;
  const svgW = cols * SQRT3 * HEX_SIZE + (SQRT3 / 2) * HEX_SIZE + HEX_SIZE * 2;
  const svgH = rows * 1.5 * HEX_SIZE + HEX_SIZE * 2;

  return (
    <div className="overflow-auto rounded-lg border border-stone-700 bg-stone-950">
      <svg width={svgW} height={svgH} style={{ display: 'block' }}>
        {map.map((rowArr, row) =>
          rowArr.map((hex) => {
            const { col } = hex.coord;
            const [cx, cy] = hexCenter(col, row, HEX_SIZE);
            const visible =
              currentCivId === null || hex.exploredBy.includes(currentCivId);
            const baseFill = TERRAIN_FILL[hex.terrain] ?? '#555';
            const fill = visible ? baseFill : '#1C1C1C';
            const controlled = hex.controlledBy && civColors[hex.controlledBy];

            return (
              <g
                key={`${col}-${row}`}
                onClick={() => onHexClick?.(hex)}
                className={onHexClick ? 'cursor-pointer' : undefined}
              >
                <polygon
                  points={hexPoints(cx, cy, HEX_SIZE - 1)}
                  fill={fill}
                  stroke={controlled ? civColors[hex.controlledBy!] : '#111'}
                  strokeWidth={controlled ? 2 : 0.5}
                  opacity={visible ? 1 : 0.4}
                />
                {visible && hex.settlement && (
                  <>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={hex.settlement.isCapital ? 7 : 4}
                      fill={controlled ? civColors[hex.controlledBy!] : '#eee'}
                      stroke="#111"
                      strokeWidth={1}
                    />
                    {hex.settlement.isCapital && (
                      <text
                        x={cx}
                        y={cy + 1}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={8}
                        fill="#111"
                        fontWeight="bold"
                      >
                        ★
                      </text>
                    )}
                  </>
                )}
                {visible && hex.units.length > 0 && !hex.settlement && (
                  <text
                    x={cx}
                    y={cy + 1}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={9}
                    fill="#fff"
                  >
                    {hex.units.length}
                  </text>
                )}
              </g>
            );
          })
        )}
      </svg>
    </div>
  );
}

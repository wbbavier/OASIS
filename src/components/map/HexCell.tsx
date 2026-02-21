// Individual hex cell rendering — terrain, territory overlay, settlement, units.

import type { Hex } from '@/engine/types';
import { hexPoints, hexCenter, HEX_SIZE } from './hex-utils';
import { TerrainIcon } from './TerrainIcons';
import { TERRAIN_FILL } from './hex-utils';

interface HexCellProps {
  hex: Hex;
  civColors: Record<string, string>;
  civNames?: Record<string, string>;
  visible: boolean;
  isSelected: boolean;
  isReachable: boolean;
  onClick?: () => void;
}

/** Castle/tower glyph for settlements. */
function SettlementMarker({ cx, cy, isCapital, color }: {
  cx: number; cy: number; isCapital: boolean; color: string;
}) {
  const size = isCapital ? 9 : 6;
  return (
    <g>
      {/* Glow ring */}
      <circle cx={cx} cy={cy} r={size + 2} fill="none" stroke={color} strokeWidth={1.5} opacity={0.4} />
      {/* Base */}
      <rect x={cx - size / 2} y={cy - size / 2} width={size} height={size}
        rx={1} fill={color} stroke="#1a1a1a" strokeWidth={0.8} />
      {/* Tower crenellations */}
      {isCapital && (
        <>
          <rect x={cx - size / 2 - 1.5} y={cy - size / 2 - 3} width={3} height={3} fill={color} stroke="#1a1a1a" strokeWidth={0.5} />
          <rect x={cx + size / 2 - 1.5} y={cy - size / 2 - 3} width={3} height={3} fill={color} stroke="#1a1a1a" strokeWidth={0.5} />
          <rect x={cx - 1.5} y={cy - size / 2 - 4} width={3} height={4} fill={color} stroke="#1a1a1a" strokeWidth={0.5} />
        </>
      )}
    </g>
  );
}

/** Unit stack indicator — colored shield with count. */
function UnitMarkers({ cx, cy, unitCivCounts, civColors, hasSettlement }: {
  cx: number; cy: number;
  unitCivCounts: Array<{ civId: string; count: number; typeName: string }>;
  civColors: Record<string, string>;
  hasSettlement: boolean;
}) {
  const baseY = hasSettlement ? cy + 14 : cy + 4;
  return (
    <g>
      {unitCivCounts.map(({ civId, count, typeName }, i) => {
        const dotCx = cx + (i - (unitCivCounts.length - 1) / 2) * 14;
        const color = civColors[civId] ?? '#ccc';
        return (
          <g key={civId}>
            {/* Shield shape */}
            <path
              d={`M${dotCx - 5},${baseY - 4} L${dotCx + 5},${baseY - 4} L${dotCx + 5},${baseY + 2} L${dotCx},${baseY + 6} L${dotCx - 5},${baseY + 2} Z`}
              fill={color} stroke="#1a1a1a" strokeWidth={0.8}
            />
            <text x={dotCx} y={baseY + 1} textAnchor="middle" dominantBaseline="middle"
              fontSize={7} fill="#111" fontWeight="bold" style={{ pointerEvents: 'none' }}>
              {count}
            </text>
            {/* Type label below shield */}
            <text x={dotCx} y={baseY + 12} textAnchor="middle" fontSize={5}
              fill="#bbb" style={{ pointerEvents: 'none', userSelect: 'none' }}>
              {typeName}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export function HexCell({
  hex, civColors, civNames, visible, isSelected, isReachable, onClick,
}: HexCellProps) {
  const { col } = hex.coord;
  const row = hex.coord.row;
  const [cx, cy] = hexCenter(col, row, HEX_SIZE);
  const baseFill = TERRAIN_FILL[hex.terrain] ?? '#555';
  const fill = visible ? baseFill : '#2A2A28';
  const controlled = hex.controlledBy && civColors[hex.controlledBy];

  // Unit counts per civ
  const unitCivCounts: Array<{ civId: string; count: number; typeName: string }> = [];
  if (visible) {
    const countMap = new Map<string, { count: number; typeName: string }>();
    for (const u of hex.units) {
      const existing = countMap.get(u.civilizationId);
      if (existing) {
        existing.count += 1;
      } else {
        countMap.set(u.civilizationId, { count: 1, typeName: u.definitionId.slice(0, 4) });
      }
    }
    for (const [cId, val] of countMap) {
      unitCivCounts.push({ civId: cId, ...val });
    }
  }

  // Tooltip
  const tooltipLines: string[] = [];
  if (visible) {
    tooltipLines.push(`Terrain: ${hex.terrain}`);
    if (hex.settlement) {
      tooltipLines.push(`Settlement: ${hex.settlement.name} (${hex.settlement.type})`);
      tooltipLines.push(`Pop: ${hex.settlement.population} | Stability: ${hex.settlement.stability}`);
    }
    if (hex.controlledBy) {
      tooltipLines.push(`Controlled by: ${civNames?.[hex.controlledBy] ?? hex.controlledBy}`);
    }
    if (hex.units.length > 0) {
      const byOwner = new Map<string, string[]>();
      for (const u of hex.units) {
        const list = byOwner.get(u.civilizationId) ?? [];
        list.push(u.definitionId);
        byOwner.set(u.civilizationId, list);
      }
      for (const [owner, units] of byOwner) {
        const ownerName = civNames?.[owner] ?? owner;
        tooltipLines.push(`Units (${ownerName}): ${units.join(', ')}`);
      }
    }
    if (hex.resources.length > 0) {
      tooltipLines.push(`Resources: ${hex.resources.map(r => `${r.resourceId} (${r.amount})`).join(', ')}`);
    }
  } else {
    tooltipLines.push('Unexplored');
  }

  const civColor = hex.controlledBy ? civColors[hex.controlledBy] : null;

  return (
    <g onClick={onClick} className={onClick ? 'cursor-pointer' : undefined}>
      <title>{tooltipLines.join('\n')}</title>

      {/* Base terrain hex */}
      <polygon
        points={hexPoints(cx, cy, HEX_SIZE - 1)}
        fill={fill}
        stroke={visible ? '#4A463E' : '#333'}
        strokeWidth={0.5}
        opacity={visible ? 1 : 0.3}
      />

      {/* Territory tint overlay */}
      {visible && civColor && (
        <polygon
          points={hexPoints(cx, cy, HEX_SIZE - 1)}
          fill={civColor}
          opacity={0.12}
          pointerEvents="none"
        />
      )}

      {/* Territory border */}
      {visible && controlled && (
        <polygon
          points={hexPoints(cx, cy, HEX_SIZE - 2)}
          fill="none"
          stroke={civColors[hex.controlledBy!]}
          strokeWidth={1.5}
          opacity={0.45}
          pointerEvents="none"
        />
      )}

      {/* Terrain icon */}
      {visible && <TerrainIcon terrain={hex.terrain} cx={cx} cy={cy} />}

      {/* Reachable overlay */}
      {isReachable && (
        <polygon
          points={hexPoints(cx, cy, HEX_SIZE - 1)}
          fill="rgba(74, 222, 128, 0.2)"
          stroke="rgba(74, 222, 128, 0.6)"
          strokeWidth={1.5}
          pointerEvents="none"
        />
      )}

      {/* Settlement */}
      {visible && hex.settlement && (
        <>
          <SettlementMarker
            cx={cx} cy={cy - 2}
            isCapital={hex.settlement.isCapital}
            color={civColor ?? '#ccc'}
          />
          <text x={cx} y={cy + (hex.settlement.isCapital ? 12 : 8)}
            textAnchor="middle" fontSize={6} fill="#eee" fontWeight="600"
            stroke="#111" strokeWidth={2} paintOrder="stroke"
            style={{ pointerEvents: 'none', userSelect: 'none' }}>
            {hex.settlement.name.length > 10
              ? hex.settlement.name.slice(0, 9) + '\u2026'
              : hex.settlement.name}
          </text>
        </>
      )}

      {/* Units */}
      {unitCivCounts.length > 0 && (
        <UnitMarkers
          cx={cx} cy={cy}
          unitCivCounts={unitCivCounts}
          civColors={civColors}
          hasSettlement={hex.settlement !== null}
        />
      )}

      {/* Selected hex outline */}
      {isSelected && (
        <polygon
          points={hexPoints(cx, cy, HEX_SIZE - 1)}
          fill="none"
          stroke="#fff"
          strokeWidth={2.5}
          pointerEvents="none"
        />
      )}
    </g>
  );
}

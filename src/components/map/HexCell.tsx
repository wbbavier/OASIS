// Individual hex cell rendering — terrain, territory overlay, settlement, units.

import type { Hex } from '@/engine/types';
import { hexPoints, hexCenter, HEX_SIZE, TERRAIN_FILL } from './hex-utils';
import { TerrainIcon } from './TerrainIcons';
import { SettlementMarker, UnitMarkers } from './HexMarkers';

interface HexCellProps {
  hex: Hex;
  civColors: Record<string, string>;
  civNames?: Record<string, string>;
  visible: boolean;
  isSelected: boolean;
  isReachable: boolean;
  isOnPath?: boolean;
  isQueuedMove?: boolean;
  onClick?: () => void;
  onHover?: () => void;
  onHoverEnd?: () => void;
}

function buildTooltip(hex: Hex, visible: boolean, civNames?: Record<string, string>): string {
  if (!visible) return 'Unexplored';
  const lines: string[] = [`Terrain: ${hex.terrain}`];
  if (hex.settlement) {
    lines.push(`Settlement: ${hex.settlement.name} (${hex.settlement.type})`);
    lines.push(`Pop: ${hex.settlement.population} | Stability: ${hex.settlement.stability}`);
  }
  if (hex.controlledBy) lines.push(`Controlled by: ${civNames?.[hex.controlledBy] ?? hex.controlledBy}`);
  if (hex.units.length > 0) {
    const byOwner = new Map<string, string[]>();
    for (const u of hex.units) {
      const list = byOwner.get(u.civilizationId) ?? [];
      list.push(u.definitionId);
      byOwner.set(u.civilizationId, list);
    }
    for (const [owner, units] of byOwner) {
      lines.push(`Units (${civNames?.[owner] ?? owner}): ${units.join(', ')}`);
    }
  }
  if (hex.resources.length > 0) {
    lines.push(`Resources: ${hex.resources.map(r => `${r.resourceId} (${r.amount})`).join(', ')}`);
  }
  return lines.join('\n');
}

export function HexCell({
  hex, civColors, civNames, visible, isSelected, isReachable,
  isOnPath, isQueuedMove, onClick, onHover, onHoverEnd,
}: HexCellProps) {
  const [cx, cy] = hexCenter(hex.coord.col, hex.coord.row, HEX_SIZE);
  const baseFill = TERRAIN_FILL[hex.terrain] ?? '#555';
  const fill = visible ? baseFill : '#2A2A28';
  const civColor = hex.controlledBy ? civColors[hex.controlledBy] ?? null : null;

  const unitCivCounts: Array<{ civId: string; count: number; typeName: string }> = [];
  if (visible) {
    const m = new Map<string, { count: number; typeName: string }>();
    for (const u of hex.units) {
      const e = m.get(u.civilizationId);
      if (e) e.count += 1;
      else m.set(u.civilizationId, { count: 1, typeName: u.definitionId.slice(0, 4) });
    }
    for (const [cId, val] of m) unitCivCounts.push({ civId: cId, ...val });
  }

  return (
    <g onClick={onClick} onPointerEnter={onHover} onPointerLeave={onHoverEnd}
      className={onClick ? 'cursor-pointer' : undefined}>
      <title>{buildTooltip(hex, visible, civNames)}</title>
      <polygon points={hexPoints(cx, cy, HEX_SIZE - 1)} fill={fill}
        stroke={visible ? '#4A463E' : '#333'} strokeWidth={0.5} opacity={visible ? 1 : 0.3} />
      {visible && civColor && (
        <polygon points={hexPoints(cx, cy, HEX_SIZE - 1)} fill={civColor} opacity={0.12} pointerEvents="none" />
      )}
      {visible && civColor && (
        <polygon points={hexPoints(cx, cy, HEX_SIZE - 2)} fill="none"
          stroke={civColor} strokeWidth={1.5} opacity={0.45} pointerEvents="none" />
      )}
      {visible && <TerrainIcon terrain={hex.terrain} cx={cx} cy={cy} />}
      {isReachable && (
        <polygon points={hexPoints(cx, cy, HEX_SIZE - 1)} fill="rgba(74,222,128,0.2)"
          stroke="rgba(74,222,128,0.6)" strokeWidth={1.5} pointerEvents="none" />
      )}
      {isOnPath && (
        <polygon points={hexPoints(cx, cy, HEX_SIZE - 1)} fill="rgba(96,165,250,0.3)"
          stroke="rgba(96,165,250,0.8)" strokeWidth={2} pointerEvents="none" />
      )}
      {isQueuedMove && (
        <polygon points={hexPoints(cx, cy, HEX_SIZE - 1)} fill="rgba(251,191,36,0.15)"
          stroke="rgba(251,191,36,0.5)" strokeWidth={1.5} pointerEvents="none" strokeDasharray="3,2" />
      )}
      {visible && hex.settlement && (
        <>
          <SettlementMarker cx={cx} cy={cy - 2} isCapital={hex.settlement.isCapital} color={civColor ?? '#ccc'} />
          <text x={cx} y={cy + (hex.settlement.isCapital ? 12 : 8)}
            textAnchor="middle" fontSize={6} fill="#eee" fontWeight="600"
            stroke="#111" strokeWidth={2} paintOrder="stroke"
            style={{ pointerEvents: 'none', userSelect: 'none' }}>
            {hex.settlement.name.length > 10 ? hex.settlement.name.slice(0, 9) + '\u2026' : hex.settlement.name}
          </text>
        </>
      )}
      {unitCivCounts.length > 0 && (
        <UnitMarkers cx={cx} cy={cy} unitCivCounts={unitCivCounts}
          civColors={civColors} hasSettlement={hex.settlement !== null} />
      )}
      {isSelected && (
        <polygon points={hexPoints(cx, cy, HEX_SIZE - 1)} fill="none"
          stroke="#fff" strokeWidth={2.5} pointerEvents="none" />
      )}
    </g>
  );
}

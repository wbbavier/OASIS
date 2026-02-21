// Settlement and unit marker SVG elements for hex cells.

/** Castle/tower glyph for settlements. */
export function SettlementMarker({ cx, cy, isCapital, color }: {
  cx: number; cy: number; isCapital: boolean; color: string;
}) {
  const size = isCapital ? 9 : 6;
  return (
    <g>
      <circle cx={cx} cy={cy} r={size + 2} fill="none" stroke={color} strokeWidth={1.5} opacity={0.4} />
      <rect x={cx - size / 2} y={cy - size / 2} width={size} height={size}
        rx={1} fill={color} stroke="#1a1a1a" strokeWidth={0.8} />
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

interface UnitCivCount {
  civId: string;
  count: number;
  typeName: string;
}

/** Unit stack indicator — colored shields with count. */
export function UnitMarkers({ cx, cy, unitCivCounts, civColors, hasSettlement }: {
  cx: number; cy: number;
  unitCivCounts: UnitCivCount[];
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
            <path
              d={`M${dotCx - 5},${baseY - 4} L${dotCx + 5},${baseY - 4} L${dotCx + 5},${baseY + 2} L${dotCx},${baseY + 6} L${dotCx - 5},${baseY + 2} Z`}
              fill={color} stroke="#1a1a1a" strokeWidth={0.8}
            />
            <text x={dotCx} y={baseY + 1} textAnchor="middle" dominantBaseline="middle"
              fontSize={7} fill="#111" fontWeight="bold" style={{ pointerEvents: 'none' }}>
              {count}
            </text>
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

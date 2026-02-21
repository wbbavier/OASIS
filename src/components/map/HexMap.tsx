'use client';
import { useRef, useState, useCallback } from 'react';
import type { Hex, HexCoord } from '@/engine/types';
import { HEX_SIZE, SQRT3, hexCenter } from './hex-utils';
import { HexCell } from './HexCell';

// Re-export for TerrainLegend backward compat
export { TERRAIN_FILL } from './hex-utils';

interface HexMapProps {
  map: Hex[][];
  currentCivId: string | null;
  civColors: Record<string, string>;
  civNames?: Record<string, string>;
  onHexClick?: (hex: Hex) => void;
  selectedCoord?: HexCoord | null;
  reachableCoords?: HexCoord[];
  fogOfWar?: boolean;
}

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2.5;

export function HexMap({
  map, currentCivId, civColors, civNames,
  onHexClick, selectedCoord, reachableCoords, fogOfWar = false,
}: HexMapProps) {
  const rows = map.length;
  const cols = rows > 0 ? (map[0]?.length ?? 0) : 0;
  const svgW = cols * SQRT3 * HEX_SIZE + (SQRT3 / 2) * HEX_SIZE + HEX_SIZE * 2;
  const svgH = rows * 1.5 * HEX_SIZE + HEX_SIZE * 2;

  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const selectedKey = selectedCoord ? `${selectedCoord.col},${selectedCoord.row}` : null;
  const reachableSet = new Set(reachableCoords?.map((c) => `${c.col},${c.row}`) ?? []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + delta)));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [pan]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan({ x: dragStart.current.panX + dx, y: dragStart.current.panY + dy });
  }, [dragging]);

  const handlePointerUp = useCallback(() => {
    setDragging(false);
  }, []);

  // Center map on player's capital on first load
  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(MAX_ZOOM, z + 0.2));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(MIN_ZOOM, z - 0.2));
  }, []);

  const handleReset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Find capital for "center on capital" button
  const handleCenterCapital = useCallback(() => {
    if (!currentCivId || !containerRef.current) return;
    for (const rowArr of map) {
      for (const hex of rowArr) {
        if (hex.settlement?.isCapital && hex.controlledBy === currentCivId) {
          const [cx, cy] = hexCenter(hex.coord.col, hex.coord.row, HEX_SIZE);
          const rect = containerRef.current.getBoundingClientRect();
          setPan({
            x: rect.width / 2 - cx * zoom,
            y: rect.height / 2 - cy * zoom,
          });
          return;
        }
      }
    }
  }, [currentCivId, map, zoom]);

  return (
    <div className="relative">
      {/* Zoom controls */}
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
        <button onClick={handleZoomIn}
          className="rounded bg-stone-800/90 border border-stone-600 w-7 h-7 text-stone-300 hover:text-white text-sm font-bold">
          +
        </button>
        <button onClick={handleZoomOut}
          className="rounded bg-stone-800/90 border border-stone-600 w-7 h-7 text-stone-300 hover:text-white text-sm font-bold">
          −
        </button>
        <button onClick={handleReset} title="Reset view"
          className="rounded bg-stone-800/90 border border-stone-600 w-7 h-7 text-stone-300 hover:text-white text-xs">
          ⟲
        </button>
        {currentCivId && (
          <button onClick={handleCenterCapital} title="Center on capital"
            className="rounded bg-stone-800/90 border border-stone-600 w-7 h-7 text-stone-300 hover:text-white text-xs">
            ⚑
          </button>
        )}
      </div>

      {/* Zoom level indicator */}
      <div className="absolute bottom-2 right-2 z-10 text-[10px] text-stone-500 bg-stone-900/80 px-1.5 py-0.5 rounded">
        {Math.round(zoom * 100)}%
      </div>

      {/* Map container with pan/zoom */}
      <div
        ref={containerRef}
        className="overflow-hidden rounded-lg border border-stone-700 bg-stone-950"
        style={{ height: '65vh', touchAction: 'none' }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <svg
          width={svgW}
          height={svgH}
          style={{
            display: 'block',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            cursor: dragging ? 'grabbing' : 'grab',
          }}
        >
          {map.map((rowArr, row) =>
            rowArr.map((hex) => {
              const coordKey = `${hex.coord.col},${row}`;
              const visible =
                !fogOfWar || currentCivId === null || hex.exploredBy.includes(currentCivId);
              return (
                <HexCell
                  key={coordKey}
                  hex={hex}
                  civColors={civColors}
                  civNames={civNames}
                  visible={visible}
                  isSelected={coordKey === selectedKey}
                  isReachable={reachableSet.has(coordKey)}
                  onClick={onHexClick ? () => onHexClick(hex) : undefined}
                />
              );
            })
          )}
        </svg>
      </div>
    </div>
  );
}

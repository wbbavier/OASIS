// Custom hook for hex selection and movement order creation.

import { useState, useEffect, useCallback } from 'react';
import type { AnyOrder, Hex, HexCoord, MoveOrder, GameState } from '@/engine/types';
import { getReachableCoords } from '@/engine/pathfinding';

interface UseHexSelectionResult {
  selectedCoord: HexCoord | null;
  reachableCoords: HexCoord[];
  handleHexClick: (hex: Hex) => void;
}

export function useHexSelection(
  gameState: GameState | null,
  currentCivId: string,
  pendingOrders: AnyOrder[],
  setPendingOrders: (orders: AnyOrder[]) => void,
): UseHexSelectionResult {
  const [selectedCoord, setSelectedCoord] = useState<HexCoord | null>(null);
  const [reachableCoords, setReachableCoords] = useState<HexCoord[]>([]);

  useEffect(() => {
    setSelectedCoord(null);
    setReachableCoords([]);
  }, [gameState?.turn]);

  const handleHexClick = useCallback((hex: Hex) => {
    if (!gameState) return;
    const playerUnitsOnHex = hex.units.filter(
      (u) => u.civilizationId === currentCivId,
    );

    // Case 1: unit selected, click reachable destination
    if (
      selectedCoord &&
      reachableCoords.some(
        (c) => c.col === hex.coord.col && c.row === hex.coord.row,
      )
    ) {
      const sourceHex = gameState.map
        .flat()
        .find(
          (h) =>
            h.coord.col === selectedCoord.col && h.coord.row === selectedCoord.row,
        );
      const unitsToMove =
        sourceHex?.units.filter((u) => u.civilizationId === currentCivId) ?? [];
      const path: HexCoord[] = [hex.coord];
      const newMoveOrders: MoveOrder[] = unitsToMove.map((u) => ({
        kind: 'move' as const,
        unitId: u.id,
        path,
      }));
      const unitIds = new Set(unitsToMove.map((u) => u.id));
      setPendingOrders([
        ...pendingOrders.filter(
          (o) => !(o.kind === 'move' && unitIds.has(o.unitId)),
        ),
        ...newMoveOrders,
      ]);
      setSelectedCoord(null);
      setReachableCoords([]);
      return;
    }

    // Case 2: click hex with player units -> select
    if (playerUnitsOnHex.length > 0) {
      const maxMoves = Math.min(...playerUnitsOnHex.map((u) => u.movesRemaining));
      const reachable =
        maxMoves > 0
          ? getReachableCoords(gameState.map, hex.coord, maxMoves)
          : [];
      setSelectedCoord(hex.coord);
      setReachableCoords(reachable);
      return;
    }

    // Case 3: deselect
    setSelectedCoord(null);
    setReachableCoords([]);
  }, [gameState, currentCivId, selectedCoord, reachableCoords, pendingOrders, setPendingOrders]);

  return { selectedCoord, reachableCoords, handleHexClick };
}

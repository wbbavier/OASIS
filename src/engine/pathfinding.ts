// Pathfinding — BFS reachable-hex computation.
// Pure function: no side effects, no randomness.

import type { Hex, HexCoord } from '@/engine/types';
import { getNeighbors } from '@/engine/map-generator';

/**
 * BFS from `from` up to `maxSteps` steps.
 * Sea hexes are impassable. Returns all reachable coords (excludes start).
 */
export function getReachableCoords(
  map: Hex[][],
  from: HexCoord,
  maxSteps: number,
): HexCoord[] {
  if (maxSteps <= 0) return [];

  const rows = map.length;
  const cols = rows > 0 ? (map[0]?.length ?? 0) : 0;

  // Build a coord→hex lookup for fast access
  const hexLookup = new Map<string, Hex>();
  for (const row of map) {
    for (const hex of row) {
      hexLookup.set(`${hex.coord.col},${hex.coord.row}`, hex);
    }
  }

  const visited = new Set<string>();
  const startKey = `${from.col},${from.row}`;
  visited.add(startKey);

  const queue: Array<{ coord: HexCoord; stepsLeft: number }> = [
    { coord: from, stepsLeft: maxSteps },
  ];

  const reachable: HexCoord[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.stepsLeft <= 0) continue;

    const neighbors = getNeighbors(current.coord, cols, rows);
    for (const neighbor of neighbors) {
      const key = `${neighbor.col},${neighbor.row}`;
      if (visited.has(key)) continue;
      visited.add(key);

      const hex = hexLookup.get(key);
      if (!hex || hex.terrain === 'sea') continue;

      reachable.push(neighbor);
      if (current.stepsLeft > 1) {
        queue.push({ coord: neighbor, stepsLeft: current.stepsLeft - 1 });
      }
    }
  }

  return reachable;
}
